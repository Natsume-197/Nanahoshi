import path from "node:path";
import { db } from "@nanahoshi-v2/db";
import {
	audiobookMetadata,
	audioFile,
	book,
	bookMetadata,
	library,
	libraryPath,
	readListenAlignment,
	readListenGeneration,
	readListenPair,
} from "@nanahoshi-v2/db/schema/general";
import { and, asc, desc, eq, inArray, or, type SQL } from "drizzle-orm";
import { batchLoaderRepository } from "../_shared/batch-loaders";
import {
	accessibleCondition,
	type LibraryScope,
} from "../_shared/library-scope";

export type ReadListenMediaType = "ebook" | "audiobook";

export type ReadListenPublication = {
	id: number;
	catalogHash: string;
	uuid: string;
	mediaType: ReadListenMediaType;
	filename: string;
	title: string;
	cover: string | null;
	mainColor: string | null;
	languageCode: string | null;
	duration: number | null;
	abridged: boolean | null;
	libraryUuid: string;
	libraryName: string | null;
	authors: { uuid?: string; name: string }[];
	narrators: { uuid?: string; name: string }[];
};

export type ReadListenAlignmentRow = {
	id: string;
	pairId: string;
	artifactPath: string;
	artifactSha256: string;
	sidecarSchema: string;
	generatorName: string;
	generatorVersion: string;
	origin: "external" | "honomiya" | null;
	generatedAt: string;
	ebookSha256: string;
	audioSha256: string[];
	ebookCatalogHash: string;
	audiobookCatalogHash: string;
	cueCount: number;
	importedAt: string;
	updatedAt: string;
};

export type ReadListenPairSources = {
	ebookPath: string;
	audioPaths: string[];
	ebookCatalogHash: string;
	audiobookCatalogHash: string;
};

export type ReadListenPairRow = {
	id: string;
	serverId: string;
	ebookBookId: number;
	audiobookBookId: number;
	createdByUserId: string | null;
	createdAt: string;
	updatedAt: string;
};

export type ReadListenGenerationStatus =
	| "queued"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export type ReadListenGenerationRow = {
	id: string;
	pairId: string;
	taskId: string;
	status: ReadListenGenerationStatus;
	provider: string;
	quality: string;
	requestedByUserId: string | null;
	ebookCatalogHash: string;
	audiobookCatalogHash: string;
	error: string | null;
	createdAt: string;
	startedAt: string | null;
	finishedAt: string | null;
	updatedAt: string;
};

export class ReadListenRepository {
	private async listPublications(
		condition: SQL,
		serverId: string,
		scope: LibraryScope,
	): Promise<ReadListenPublication[]> {
		const rows = await db
			.select({
				id: book.id,
				catalogHash: book.filehash,
				uuid: book.uuid,
				filename: book.filename,
				mediaType: library.mediaType,
				libraryUuid: library.uuid,
				libraryName: library.name,
				ebookTitle: bookMetadata.title,
				ebookCover: bookMetadata.cover,
				ebookMainColor: bookMetadata.mainColor,
				ebookLanguageCode: bookMetadata.languageCode,
				audiobookTitle: audiobookMetadata.title,
				audiobookCover: audiobookMetadata.cover,
				audiobookMainColor: audiobookMetadata.mainColor,
				audiobookLanguageCode: audiobookMetadata.languageCode,
				duration: audiobookMetadata.duration,
				abridged: audiobookMetadata.abridged,
			})
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.leftJoin(bookMetadata, eq(bookMetadata.bookId, book.id))
			.leftJoin(audiobookMetadata, eq(audiobookMetadata.bookId, book.id))
			.where(
				and(
					condition,
					eq(library.serverId, serverId),
					accessibleCondition(scope),
				),
			);

		const ebookIds = rows
			.filter((row) => row.mediaType === "ebook")
			.map((row) => row.id);
		const audiobookIds = rows
			.filter((row) => row.mediaType === "audiobook")
			.map((row) => row.id);
		const [ebookAuthors, audiobookAuthors, narrators] = await Promise.all([
			batchLoaderRepository.loadEbookAuthors(ebookIds),
			batchLoaderRepository.loadAudiobookAuthors(audiobookIds),
			batchLoaderRepository.loadNarrators(audiobookIds),
		]);

		return rows.map((row) => {
			const mediaType = row.mediaType;
			const authors =
				mediaType === "audiobook" ? audiobookAuthors : ebookAuthors;
			return {
				id: row.id,
				catalogHash: row.catalogHash,
				uuid: row.uuid,
				mediaType,
				filename: row.filename,
				title:
					(mediaType === "audiobook" ? row.audiobookTitle : row.ebookTitle) ??
					row.filename,
				cover: mediaType === "audiobook" ? row.audiobookCover : row.ebookCover,
				mainColor:
					mediaType === "audiobook"
						? row.audiobookMainColor
						: row.ebookMainColor,
				languageCode:
					mediaType === "audiobook"
						? row.audiobookLanguageCode
						: row.ebookLanguageCode,
				duration: mediaType === "audiobook" ? row.duration : null,
				abridged: mediaType === "audiobook" ? row.abridged : null,
				libraryUuid: row.libraryUuid,
				libraryName: row.libraryName,
				authors: (authors.get(row.id) ?? []).map(({ uuid, name }) => ({
					uuid,
					name,
				})),
				narrators: (narrators.get(row.id) ?? []).map(({ uuid, name }) => ({
					uuid,
					name,
				})),
			};
		});
	}

	private async getPublication(
		condition: SQL,
		serverId: string,
		scope: LibraryScope,
	): Promise<ReadListenPublication | null> {
		return (await this.listPublications(condition, serverId, scope))[0] ?? null;
	}

	getPublicationByUuid(
		uuid: string,
		serverId: string,
		scope: LibraryScope,
	): Promise<ReadListenPublication | null> {
		return this.getPublication(eq(book.uuid, uuid), serverId, scope);
	}

	getPublicationById(
		id: number,
		serverId: string,
		scope: LibraryScope,
	): Promise<ReadListenPublication | null> {
		return this.getPublication(eq(book.id, id), serverId, scope);
	}

	listPublicationsByIds(
		ids: number[],
		serverId: string,
		scope: LibraryScope,
	): Promise<ReadListenPublication[]> {
		if (ids.length === 0) return Promise.resolve([]);
		return this.listPublications(inArray(book.id, ids), serverId, scope);
	}

	listPublicationsByUuids(
		uuids: string[],
		serverId: string,
		scope: LibraryScope,
	): Promise<ReadListenPublication[]> {
		if (uuids.length === 0) return Promise.resolve([]);
		return this.listPublications(inArray(book.uuid, uuids), serverId, scope);
	}

	async listPairRows(
		publicationId: number,
		serverId: string,
	): Promise<ReadListenPairRow[]> {
		return await db
			.select()
			.from(readListenPair)
			.where(
				and(
					eq(readListenPair.serverId, serverId),
					or(
						eq(readListenPair.ebookBookId, publicationId),
						eq(readListenPair.audiobookBookId, publicationId),
					),
				),
			)
			.orderBy(readListenPair.createdAt);
	}

	async listAllPairRows(
		serverId: string,
		offset = 0,
		limit = 50,
	): Promise<ReadListenPairRow[]> {
		return await db
			.select()
			.from(readListenPair)
			.where(eq(readListenPair.serverId, serverId))
			.orderBy(desc(readListenPair.updatedAt))
			.offset(offset)
			.limit(limit);
	}

	async getPairRow(
		id: string,
		serverId: string,
	): Promise<ReadListenPairRow | null> {
		const [row] = await db
			.select()
			.from(readListenPair)
			.where(
				and(eq(readListenPair.id, id), eq(readListenPair.serverId, serverId)),
			)
			.limit(1);
		return row ?? null;
	}

	async listAlignmentRows(
		pairIds: string[],
		serverId: string,
	): Promise<ReadListenAlignmentRow[]> {
		if (pairIds.length === 0) return [];
		return db
			.select({
				id: readListenAlignment.id,
				pairId: readListenAlignment.pairId,
				artifactPath: readListenAlignment.artifactPath,
				artifactSha256: readListenAlignment.artifactSha256,
				sidecarSchema: readListenAlignment.sidecarSchema,
				generatorName: readListenAlignment.generatorName,
				generatorVersion: readListenAlignment.generatorVersion,
				origin: readListenAlignment.origin,
				generatedAt: readListenAlignment.generatedAt,
				ebookSha256: readListenAlignment.ebookSha256,
				audioSha256: readListenAlignment.audioSha256,
				ebookCatalogHash: readListenAlignment.ebookCatalogHash,
				audiobookCatalogHash: readListenAlignment.audiobookCatalogHash,
				cueCount: readListenAlignment.cueCount,
				importedAt: readListenAlignment.importedAt,
				updatedAt: readListenAlignment.updatedAt,
			})
			.from(readListenAlignment)
			.innerJoin(
				readListenPair,
				eq(readListenPair.id, readListenAlignment.pairId),
			)
			.where(
				and(
					eq(readListenPair.serverId, serverId),
					inArray(readListenAlignment.pairId, pairIds),
				),
			);
	}

	async listLatestGenerationRows(
		pairIds: string[],
		serverId: string,
	): Promise<ReadListenGenerationRow[]> {
		if (pairIds.length === 0) return [];
		const rows = await db
			.select({
				id: readListenGeneration.id,
				pairId: readListenGeneration.pairId,
				taskId: readListenGeneration.taskId,
				status: readListenGeneration.status,
				provider: readListenGeneration.provider,
				quality: readListenGeneration.quality,
				requestedByUserId: readListenGeneration.requestedByUserId,
				ebookCatalogHash: readListenGeneration.ebookCatalogHash,
				audiobookCatalogHash: readListenGeneration.audiobookCatalogHash,
				error: readListenGeneration.error,
				createdAt: readListenGeneration.createdAt,
				startedAt: readListenGeneration.startedAt,
				finishedAt: readListenGeneration.finishedAt,
				updatedAt: readListenGeneration.updatedAt,
			})
			.from(readListenGeneration)
			.innerJoin(
				readListenPair,
				eq(readListenPair.id, readListenGeneration.pairId),
			)
			.where(
				and(
					eq(readListenPair.serverId, serverId),
					inArray(readListenGeneration.pairId, pairIds),
				),
			)
			.orderBy(desc(readListenGeneration.createdAt));

		const latest = new Map<string, ReadListenGenerationRow>();
		for (const row of rows) {
			if (!latest.has(row.pairId)) latest.set(row.pairId, row);
		}
		return [...latest.values()];
	}

	async createGenerationAttempt(input: {
		pairId: string;
		taskId: string;
		provider: string;
		quality: string;
		requestedByUserId: string;
		ebookCatalogHash: string;
		audiobookCatalogHash: string;
	}): Promise<
		| { outcome: "created"; generation: ReadListenGenerationRow }
		| { outcome: "already_running"; generation: ReadListenGenerationRow }
	> {
		const [created] = await db
			.insert(readListenGeneration)
			.values(input)
			.onConflictDoNothing()
			.returning();
		if (created) return { outcome: "created", generation: created };

		const [active] = await db
			.select()
			.from(readListenGeneration)
			.where(
				and(
					eq(readListenGeneration.pairId, input.pairId),
					inArray(readListenGeneration.status, ["queued", "running"]),
				),
			)
			.orderBy(desc(readListenGeneration.createdAt))
			.limit(1);
		if (!active) {
			throw new Error(
				"Read & Listen generation conflict could not be resolved",
			);
		}
		return { outcome: "already_running", generation: active };
	}

	async updateGenerationStatus(
		taskId: string,
		status: ReadListenGenerationStatus,
		error: string | null = null,
	): Promise<void> {
		const now = new Date().toISOString();
		await db
			.update(readListenGeneration)
			.set({
				status,
				error,
				updatedAt: now,
				...(status === "running" ? { startedAt: now } : {}),
				...(["completed", "failed", "cancelled"].includes(status)
					? { finishedAt: now }
					: {}),
			})
			.where(eq(readListenGeneration.taskId, taskId));
	}

	async getPairSources(
		row: ReadListenPairRow,
		serverId: string,
		scope: LibraryScope,
	): Promise<ReadListenPairSources | null> {
		const [ebookRows, audiobookRows] = await Promise.all([
			db
				.select({
					catalogHash: book.filehash,
					relativePath: book.relativePath,
					rootPath: libraryPath.path,
				})
				.from(book)
				.innerJoin(library, eq(library.id, book.libraryId))
				.innerJoin(libraryPath, eq(libraryPath.id, book.libraryPathId))
				.where(
					and(
						eq(book.id, row.ebookBookId),
						eq(library.serverId, serverId),
						eq(library.mediaType, "ebook"),
						accessibleCondition(scope),
					),
				)
				.limit(1),
			db
				.select({
					catalogHash: book.filehash,
					path: audioFile.path,
					index: audioFile.index,
				})
				.from(book)
				.innerJoin(library, eq(library.id, book.libraryId))
				.innerJoin(audioFile, eq(audioFile.bookId, book.id))
				.where(
					and(
						eq(book.id, row.audiobookBookId),
						eq(library.serverId, serverId),
						eq(library.mediaType, "audiobook"),
						accessibleCondition(scope),
					),
				)
				.orderBy(asc(audioFile.index)),
		]);

		const ebook = ebookRows[0];
		const firstAudio = audiobookRows[0];
		if (!ebook?.relativePath || !firstAudio) return null;
		const rootPath = path.resolve(ebook.rootPath);
		const ebookPath = path.resolve(rootPath, ebook.relativePath);
		if (
			ebookPath !== rootPath &&
			!ebookPath.startsWith(`${rootPath}${path.sep}`)
		) {
			return null;
		}

		return {
			ebookPath,
			audioPaths: audiobookRows.map((audio) => path.resolve(audio.path)),
			ebookCatalogHash: ebook.catalogHash,
			audiobookCatalogHash: firstAudio.catalogHash,
		};
	}

	async upsertAlignment(
		input: Omit<ReadListenAlignmentRow, "id" | "importedAt" | "updatedAt">,
	): Promise<ReadListenAlignmentRow> {
		const now = new Date().toISOString();
		const [row] = await db
			.insert(readListenAlignment)
			.values({ ...input, importedAt: now, updatedAt: now })
			.onConflictDoUpdate({
				target: readListenAlignment.pairId,
				set: { ...input, importedAt: now, updatedAt: now },
			})
			.returning();
		if (!row) throw new Error("Read & Listen alignment could not be stored");
		return row;
	}

	async createPair(input: {
		serverId: string;
		ebookBookId: number;
		audiobookBookId: number;
		createdByUserId: string;
	}): Promise<ReadListenPairRow> {
		const [created] = await db
			.insert(readListenPair)
			.values(input)
			.onConflictDoNothing({
				target: [readListenPair.ebookBookId, readListenPair.audiobookBookId],
			})
			.returning();

		if (created) return created;

		const [existing] = await db
			.select()
			.from(readListenPair)
			.where(
				and(
					eq(readListenPair.serverId, input.serverId),
					eq(readListenPair.ebookBookId, input.ebookBookId),
					eq(readListenPair.audiobookBookId, input.audiobookBookId),
				),
			)
			.limit(1);

		if (!existing) {
			throw new Error("Read & Listen pair conflict could not be resolved");
		}
		return existing;
	}

	async deletePair(id: string, serverId: string): Promise<boolean> {
		const deleted = await db
			.delete(readListenPair)
			.where(
				and(eq(readListenPair.id, id), eq(readListenPair.serverId, serverId)),
			);
		return (deleted.rowCount ?? 0) > 0;
	}
}

export const readListenRepository = new ReadListenRepository();
