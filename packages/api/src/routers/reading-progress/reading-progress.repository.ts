import { db } from "@nanahoshi-v2/db";
import {
	book,
	bookMetadata,
	readingProgress,
} from "@nanahoshi-v2/db/schema/general";
import { and, desc, eq, sql } from "drizzle-orm";
import { READING_STATUSES } from "../../constants";
import type { ReadingProgress } from "./reading-progress.model";

export class ReadingProgressRepository {
	async upsert(
		userId: string,
		bookId: number,
		data: {
			ttuBookId?: number;
			exploredCharCount?: number;
			bookCharCount?: number;
			readingTimeSeconds?: number;
			status?: string;
		},
	): Promise<ReadingProgress> {
		const now = new Date().toISOString();
		const rows = await db
			.insert(readingProgress)
			.values({
				userId,
				bookId,
				ttuBookId: data.ttuBookId,
				exploredCharCount: data.exploredCharCount ?? 0,
				bookCharCount: data.bookCharCount ?? 0,
				readingTimeSeconds: data.readingTimeSeconds ?? 0,
				status: data.status ?? READING_STATUSES.READING,
				startedAt: now,
				lastReadAt: now,
			})
			.onConflictDoUpdate({
				target: [readingProgress.userId, readingProgress.bookId],
				set: {
					...(data.ttuBookId !== undefined && { ttuBookId: data.ttuBookId }),
					...(data.exploredCharCount !== undefined && {
						exploredCharCount: data.exploredCharCount,
					}),
					...(data.bookCharCount !== undefined && {
						bookCharCount: data.bookCharCount,
					}),
					...(data.readingTimeSeconds !== undefined && {
						readingTimeSeconds: sql`${readingProgress.readingTimeSeconds} + ${data.readingTimeSeconds}`,
					}),
					...(data.status !== undefined && { status: data.status }),
					lastReadAt: now,
					...(data.status === READING_STATUSES.COMPLETED && {
						completedAt: now,
					}),
				},
			})
			.returning();
		return rows[0] as ReadingProgress;
	}

	async getByUserAndBook(
		userId: string,
		bookId: number,
	): Promise<ReadingProgress | null> {
		const [result] = await db
			.select()
			.from(readingProgress)
			.where(
				and(
					eq(readingProgress.userId, userId),
					eq(readingProgress.bookId, bookId),
				),
			);
		return result ?? null;
	}

	async listInProgress(userId: string, limit = 20) {
		return db
			.select({
				id: readingProgress.id,
				bookId: readingProgress.bookId,
				ttuBookId: readingProgress.ttuBookId,
				exploredCharCount: readingProgress.exploredCharCount,
				bookCharCount: readingProgress.bookCharCount,
				readingTimeSeconds: readingProgress.readingTimeSeconds,
				status: readingProgress.status,
				lastReadAt: readingProgress.lastReadAt,
				bookUuid: book.uuid,
				bookFilename: book.filename,
				title: bookMetadata.title,
				cover: bookMetadata.cover,
				mainColor: bookMetadata.mainColor,
			})
			.from(readingProgress)
			.innerJoin(book, eq(book.id, readingProgress.bookId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.where(
				and(
					eq(readingProgress.userId, userId),
					eq(readingProgress.status, READING_STATUSES.READING),
				),
			)
			.orderBy(desc(readingProgress.lastReadAt))
			.limit(limit);
	}
}

export const readingProgressRepository = new ReadingProgressRepository();
