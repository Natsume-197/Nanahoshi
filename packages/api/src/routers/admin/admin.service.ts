import { db } from "@nanahoshi-v2/db";
import { member, organization, user } from "@nanahoshi-v2/db/schema/auth";
import { book, library } from "@nanahoshi-v2/db/schema/general";
import { eq } from "drizzle-orm";

export async function getSystemStats() {
	const [users, orgs, books, libraries] = await Promise.all([
		db.select({ id: user.id }).from(user),
		db.select({ id: organization.id }).from(organization),
		db.select({ id: book.id }).from(book),
		db.select({ id: library.id }).from(library),
	]);

	return {
		userCount: users.length,
		organizationCount: orgs.length,
		bookCount: books.length,
		libraryCount: libraries.length,
	};
}

export async function listUsers() {
	return db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			banned: user.banned,
			banReason: user.banReason,
			createdAt: user.createdAt,
		})
		.from(user);
}

export async function banUser(userId: string, reason?: string) {
	await db
		.update(user)
		.set({ banned: true, banReason: reason ?? null })
		.where(eq(user.id, userId));
}

export async function unbanUser(userId: string) {
	await db
		.update(user)
		.set({ banned: false, banReason: null, banExpires: null })
		.where(eq(user.id, userId));
}

export async function setUserRole(userId: string, role: "user" | "admin") {
	await db.update(user).set({ role }).where(eq(user.id, userId));
}

export async function listOrganizations() {
	return db.select().from(organization);
}

export async function createOrganization(name: string, slug: string) {
	const id = crypto.randomUUID();
	const [org] = await db
		.insert(organization)
		.values({
			id,
			name,
			slug,
			createdAt: new Date(),
		})
		.returning();
	return org;
}

export async function deleteOrganization(orgId: string) {
	await db.delete(organization).where(eq(organization.id, orgId));
}

export async function getOrgWithMembers(orgId: string) {
	const org = await db
		.select()
		.from(organization)
		.where(eq(organization.id, orgId))
		.limit(1);

	if (org.length === 0) return null;

	const members = await db
		.select({
			id: member.id,
			role: member.role,
			createdAt: member.createdAt,
			userId: member.userId,
			userName: user.name,
			userEmail: user.email,
		})
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(eq(member.organizationId, orgId));

	return { ...org[0], members };
}

export async function removeMember(memberId: string) {
	await db.delete(member).where(eq(member.id, memberId));
}

export async function updateMemberRole(memberId: string, role: string) {
	await db.update(member).set({ role }).where(eq(member.id, memberId));
}
