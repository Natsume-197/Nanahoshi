import { db } from "@nanahoshi-v2/db";
import {
	library,
	libraryPermissionOverwrite,
} from "@nanahoshi-v2/db/schema/general";
import { and, eq, sql } from "drizzle-orm";
import type { PermissionMap } from "../../auth/permissions.catalog";

export type OverwriteRow = {
	id: number;
	libraryId: number;
	subjectType: "everyone" | "role" | "user";
	subjectId: string | null;
	allow: PermissionMap;
	deny: PermissionMap;
};

export const libraryAccessRepository = {
	async libraryInOrg(
		libraryId: number,
		organizationId: string,
	): Promise<boolean> {
		const [l] = await db
			.select({ id: library.id })
			.from(library)
			.where(
				and(
					eq(library.id, libraryId),
					eq(library.organizationId, organizationId),
				),
			)
			.limit(1);
		return !!l;
	},

	async list(
		libraryId: number,
		organizationId: string,
	): Promise<OverwriteRow[]> {
		const rows = await db
			.select({
				id: libraryPermissionOverwrite.id,
				libraryId: libraryPermissionOverwrite.libraryId,
				subjectType: libraryPermissionOverwrite.subjectType,
				subjectId: libraryPermissionOverwrite.subjectId,
				allow: libraryPermissionOverwrite.allow,
				deny: libraryPermissionOverwrite.deny,
			})
			.from(libraryPermissionOverwrite)
			.where(
				and(
					eq(libraryPermissionOverwrite.libraryId, libraryId),
					eq(libraryPermissionOverwrite.organizationId, organizationId),
				),
			);
		return rows;
	},

	// Select-then-write rather than ON CONFLICT: the unique index treats NULL
	// subjectId (the "everyone" subject) as distinct, so upsert wouldn't match it.
	async upsert(input: {
		libraryId: number;
		organizationId: string;
		subjectType: "everyone" | "role" | "user";
		subjectId: string | null;
		allow: PermissionMap;
		deny: PermissionMap;
	}): Promise<void> {
		await db.transaction(async (tx) => {
			const subjectFilter =
				input.subjectId === null
					? sql`${libraryPermissionOverwrite.subjectId} is null`
					: eq(libraryPermissionOverwrite.subjectId, input.subjectId);
			const [existing] = await tx
				.select({ id: libraryPermissionOverwrite.id })
				.from(libraryPermissionOverwrite)
				.where(
					and(
						eq(libraryPermissionOverwrite.libraryId, input.libraryId),
						eq(libraryPermissionOverwrite.subjectType, input.subjectType),
						subjectFilter,
					),
				)
				.limit(1);

			if (existing) {
				await tx
					.update(libraryPermissionOverwrite)
					.set({
						allow: input.allow,
						deny: input.deny,
					})
					.where(eq(libraryPermissionOverwrite.id, existing.id));
			} else {
				await tx.insert(libraryPermissionOverwrite).values({
					libraryId: input.libraryId,
					organizationId: input.organizationId,
					subjectType: input.subjectType,
					subjectId: input.subjectId,
					allow: input.allow,
					deny: input.deny,
				});
			}
		});
	},

	async delete(id: number, organizationId: string): Promise<boolean> {
		const deleted = await db
			.delete(libraryPermissionOverwrite)
			.where(
				and(
					eq(libraryPermissionOverwrite.id, id),
					eq(libraryPermissionOverwrite.organizationId, organizationId),
				),
			);
		return (deleted.rowCount ?? 0) > 0;
	},
};
