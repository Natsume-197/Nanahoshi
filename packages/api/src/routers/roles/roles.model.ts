import { z } from "zod";
import { PERMISSIONS } from "../../auth/permissions.catalog";

/** z.record (not z.object) so the inferred type has no `| undefined` values; refined against the catalog. */
export const permissionMapSchema = z
	.record(z.string(), z.array(z.string()))
	.superRefine((map, ctx) => {
		for (const [resource, actions] of Object.entries(map)) {
			const valid = PERMISSIONS[resource as keyof typeof PERMISSIONS] as
				| readonly string[]
				| undefined;
			if (!valid) {
				ctx.addIssue({
					code: "custom",
					message: `Unknown permission resource: ${resource}`,
				});
				continue;
			}
			for (const action of actions) {
				if (!valid.includes(action)) {
					ctx.addIssue({
						code: "custom",
						message: `Unknown action "${action}" for resource "${resource}"`,
					});
				}
			}
		}
	});

export const createRoleInput = z.object({
	name: z.string().min(1).max(64),
	color: z.string().max(32).nullable().default(null),
	permissions: permissionMapSchema.default({}),
});

export const updateRoleInput = z.object({
	id: z.string(),
	name: z.string().min(1).max(64).optional(),
	color: z.string().max(32).nullable().optional(),
	position: z.number().int().min(1).optional(),
	permissions: permissionMapSchema.optional(),
});

export const deleteRoleInput = z.object({ id: z.string() });

export const assignMemberRolesInput = z.object({
	userId: z.string(),
	roleIds: z.array(z.string()),
});

export const reorderRolesInput = z.object({
	/** Custom role ids, highest-first. */
	orderedIds: z.array(z.string()).min(1),
});
