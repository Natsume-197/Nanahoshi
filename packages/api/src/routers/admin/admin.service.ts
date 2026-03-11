import { db } from "@nanahoshi-v2/db";
import { member, organization, user } from "@nanahoshi-v2/db/schema/auth";
import { book, bookMetadata, library } from "@nanahoshi-v2/db/schema/general";
import { and, count, eq, isNotNull, isNull } from "drizzle-orm";
import { bookIndexQueue } from "../../infrastructure/queue/queues/book-index.queue";
import { coverColorQueue } from "../../infrastructure/queue/queues/cover-color.queue";
import { createTask } from "../../modules/taskManager";

export async function getSystemStats() {
	const [users, orgs, books, libraries] = await Promise.all([
		db.select({ count: count() }).from(user),
		db.select({ count: count() }).from(organization),
		db.select({ count: count() }).from(book),
		db.select({ count: count() }).from(library),
	]);

	return {
		userCount: users[0]?.count ?? 0,
		organizationCount: orgs[0]?.count ?? 0,
		bookCount: books[0]?.count ?? 0,
		libraryCount: libraries[0]?.count ?? 0,
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

export async function createOrganization(name: string, slug: string, creatorId: string) {
	const id = crypto.randomUUID();
	
	await db.transaction(async (tx) => {
		await tx.insert(organization).values({
			id,
			name,
			slug,
			createdAt: new Date(),
		});

		await tx.insert(member).values({
			id: crypto.randomUUID(),
			organizationId: id,
			userId: creatorId,
			role: "owner",
			createdAt: new Date(),
		});
	});

	return { id, name, slug };
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

/**
 * Enqueues cover-color extraction jobs for all books that have a cover
 * but no mainColor yet. Returns the number of jobs enqueued.
 */
export async function backfillCoverColors(): Promise<number> {
	const rows = await db
		.select({
			bookId: bookMetadata.bookId,
			cover: bookMetadata.cover,
		})
		.from(bookMetadata)
		.where(and(isNotNull(bookMetadata.cover), isNull(bookMetadata.mainColor)));

	if (rows.length === 0) return 0;

	const jobs = rows.map((row) => ({
		name: "backfill",
		data: {
			bookId: Number(row.bookId),
			coverPath: row.cover!,
		},
		opts: { removeOnComplete: true, removeOnFail: 100 },
	}));
	await coverColorQueue.addBulk(jobs);

	return jobs.length;
}

/**
 * Enqueues a one-off full book reindex job and creates a visible task entry.
 */
export async function triggerBookReindex(): Promise<void> {
	const task = await createTask({
		type: "book-reindex",
		label: "Reindex books",
		totalJobs: 1,
	});
	await bookIndexQueue.add(
		"reindex",
		{ taskId: task.id },
		{
			removeOnComplete: true,
			removeOnFail: false,
		},
	);
}
