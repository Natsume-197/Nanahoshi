import { canManageRole, grantsSubset } from "../../auth/access.service";
import { BadRequestError, ForbiddenError, NotFoundError } from "../../errors";
import { requirePermission } from "../../index";
import {
	assignMemberRolesInput,
	createRoleInput,
	deleteRoleInput,
	reorderRolesInput,
	updateRoleInput,
} from "./roles.model";
import { rolesRepository } from "./roles.repository";

export const rolesRouter = {
	list: requirePermission("roles", "manage").handler(async ({ context }) => {
		return rolesRepository.list(context.serverId);
	}),

	listAssignments: requirePermission("member", "assignRoles").handler(
		async ({ context }) => {
			return rolesRepository.listAssignments(context.serverId);
		},
	),

	create: requirePermission("roles", "manage")
		.input(createRoleInput)
		.handler(async ({ input, context }) => {
			const pc = context.pc;
			if (!grantsSubset(pc, input.permissions)) {
				throw new ForbiddenError(
					"You cannot grant permissions you do not have",
				);
			}
			// New role sits just above the current top, but below the actor's highest.
			const maxPosition = await rolesRepository.maxPosition(context.serverId);
			const desired = maxPosition + 1;
			const position =
				pc.isAppOwner || pc.isOrgOwner
					? desired
					: Math.min(desired, pc.highestPosition - 1);
			if (position < 1) {
				throw new ForbiddenError(
					"You cannot create a role at or above your highest role",
				);
			}
			return rolesRepository.create({
				serverId: context.serverId,
				name: input.name,
				color: input.color,
				position,
				permissions: input.permissions,
			});
		}),

	update: requirePermission("roles", "manage")
		.input(updateRoleInput)
		.handler(async ({ input, context }) => {
			const pc = context.pc;
			const existing = await rolesRepository.getById(
				input.id,
				context.serverId,
			);
			if (!existing) throw new NotFoundError("Role not found");

			if (!canManageRole(pc, existing.position)) {
				throw new ForbiddenError("You cannot manage this role");
			}
			if (
				existing.isDefault &&
				((input.name !== undefined && input.name !== existing.name) ||
					(input.position !== undefined &&
						input.position !== existing.position))
			) {
				throw new ForbiddenError(
					"The default role's name and position cannot be changed",
				);
			}
			if (input.position !== undefined && !canManageRole(pc, input.position)) {
				throw new ForbiddenError("You cannot move a role above your own");
			}
			if (
				input.permissions !== undefined &&
				!grantsSubset(pc, input.permissions)
			) {
				throw new ForbiddenError(
					"You cannot grant permissions you do not have",
				);
			}

			const updated = await rolesRepository.update(input.id, context.serverId, {
				name: input.name,
				color: input.color,
				position: input.position,
				permissions: input.permissions,
			});
			if (!updated) throw new NotFoundError("Role not found");
			return updated;
		}),

	delete: requirePermission("roles", "manage")
		.input(deleteRoleInput)
		.handler(async ({ input, context }) => {
			const pc = context.pc;
			const existing = await rolesRepository.getById(
				input.id,
				context.serverId,
			);
			if (!existing) throw new NotFoundError("Role not found");
			if (existing.isDefault) {
				throw new ForbiddenError("The default role cannot be deleted");
			}
			if (!canManageRole(pc, existing.position)) {
				throw new ForbiddenError("You cannot manage this role");
			}
			await rolesRepository.delete(input.id, context.serverId);
			return { success: true };
		}),

	reorder: requirePermission("roles", "manage")
		.input(reorderRolesInput)
		.handler(async ({ input, context }) => {
			const pc = context.pc;
			const orderedIdSet = new Set(input.orderedIds);
			if (orderedIdSet.size !== input.orderedIds.length) {
				throw new BadRequestError("Role order contains duplicate roles");
			}

			const roles = (await rolesRepository.list(context.serverId)).filter(
				(r) => !r.isDefault,
			);
			if (
				roles.length !== input.orderedIds.length ||
				roles.some((r) => !orderedIdSet.has(r.id))
			) {
				throw new BadRequestError("Role order must include every custom role");
			}
			for (const r of roles) {
				if (!canManageRole(pc, r.position)) {
					throw new ForbiddenError(`You cannot reorder the role "${r.name}"`);
				}
			}
			// orderedIds.length is the new top position; the actor must outrank it.
			if (!canManageRole(pc, input.orderedIds.length)) {
				throw new ForbiddenError(
					"You cannot move roles above your highest role",
				);
			}
			await rolesRepository.reorder(context.serverId, input.orderedIds);
			return { success: true };
		}),

	assignMemberRoles: requirePermission("member", "assignRoles")
		.input(assignMemberRolesInput)
		.handler(async ({ input, context }) => {
			const pc = context.pc;
			if (!(await rolesRepository.isMember(input.userId, context.serverId))) {
				throw new NotFoundError("Member not found");
			}
			const roles = await rolesRepository.assignableRolesByIds(
				input.roleIds,
				context.serverId,
			);
			if (roles.length !== input.roleIds.length) {
				throw new NotFoundError("One or more roles not found");
			}
			for (const r of roles) {
				if (r.isDefault) {
					throw new ForbiddenError("The default role cannot be assigned");
				}
				if (!canManageRole(pc, r.position)) {
					throw new ForbiddenError(`You cannot assign the role "${r.name}"`);
				}
			}
			await rolesRepository.setMemberRoles(
				input.userId,
				context.serverId,
				input.roleIds,
			);
			return { success: true };
		}),
};
