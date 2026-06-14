import { canManageRole, grantsSubset } from "../../auth/access.service";
import { ForbiddenError, NotFoundError } from "../../errors";
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
		return rolesRepository.list(context.organizationId);
	}),

	listAssignments: requirePermission("member", "assignRoles").handler(
		async ({ context }) => {
			return rolesRepository.listAssignments(context.organizationId);
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
			const maxPosition = await rolesRepository.maxPosition(
				context.organizationId,
			);
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
				organizationId: context.organizationId,
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
				context.organizationId,
			);
			if (!existing) throw new NotFoundError("Role not found");

			if (!canManageRole(pc, existing.position)) {
				throw new ForbiddenError("You cannot manage this role");
			}
			if (
				existing.isDefault &&
				(input.name !== undefined || input.position !== undefined)
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

			const updated = await rolesRepository.update(
				input.id,
				context.organizationId,
				{
					name: input.name,
					color: input.color,
					position: input.position,
					permissions: input.permissions,
				},
			);
			if (!updated) throw new NotFoundError("Role not found");
			return updated;
		}),

	delete: requirePermission("roles", "manage")
		.input(deleteRoleInput)
		.handler(async ({ input, context }) => {
			const pc = context.pc;
			const existing = await rolesRepository.getById(
				input.id,
				context.organizationId,
			);
			if (!existing) throw new NotFoundError("Role not found");
			if (existing.isDefault) {
				throw new ForbiddenError("The default role cannot be deleted");
			}
			if (!canManageRole(pc, existing.position)) {
				throw new ForbiddenError("You cannot manage this role");
			}
			await rolesRepository.delete(input.id, context.organizationId);
			return { success: true };
		}),

	reorder: requirePermission("roles", "manage")
		.input(reorderRolesInput)
		.handler(async ({ input, context }) => {
			const pc = context.pc;
			const roles = await rolesRepository.assignableRolesByIds(
				input.orderedIds,
				context.organizationId,
			);
			if (roles.length !== input.orderedIds.length) {
				throw new NotFoundError("One or more roles not found");
			}
			for (const r of roles) {
				if (r.isDefault) {
					throw new ForbiddenError("The default role cannot be reordered");
				}
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
			await rolesRepository.reorder(context.organizationId, input.orderedIds);
			return { success: true };
		}),

	assignMemberRoles: requirePermission("member", "assignRoles")
		.input(assignMemberRolesInput)
		.handler(async ({ input, context }) => {
			const pc = context.pc;
			if (
				!(await rolesRepository.isMember(input.userId, context.organizationId))
			) {
				throw new NotFoundError("Member not found");
			}
			const roles = await rolesRepository.assignableRolesByIds(
				input.roleIds,
				context.organizationId,
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
				context.organizationId,
				input.roleIds,
			);
			return { success: true };
		}),
};
