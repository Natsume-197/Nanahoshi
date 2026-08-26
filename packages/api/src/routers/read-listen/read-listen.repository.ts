import path from "node:path";
import { db } from "@nanahoshi-v2/db";
import {
	audiobookMetadata,
	audiobookSeries,
	audioFile,
	book,
	bookMetadata,
	bookSeries,
	library,
	libraryPath,
	readListenAlignment,
	readListenGeneration,
	readListenMatchAnalysis,
	readListenMatchAnalysisOutcome,
	readListenMatchDecision,
	readListenMatchEvaluation,
	readListenMatchProposal,
	readListenPair,
	series,
} from "@nanahoshi-v2/db/schema/general";
import {
	and,
	asc,
	desc,
	eq,
	inArray,
	isNull,
	notExists,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { batchLoaderRepository } from "../_shared/batch-loaders";
import {
	accessibleCondition,
	accessiblePredicateSql,
	type LibraryScope,
	visibleBookSql,
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
	series: { name: string; position: number | null }[];
};

export type ReadListenMatchProposalRow =
	typeof readListenMatchProposal.$inferSelect;
export type ReadListenMatchDecisionRow =
	typeof readListenMatchDecision.$inferSelect;
export type ReadListenMatchAnalysisRow =
	typeof readListenMatchAnalysis.$inferSelect;

export type ReadListenMatchProposalPageRow =
	| (ReadListenMatchProposalRow & {
			origin: "matcher";
			decisionAction: ReadListenMatchDecisionRow["action"] | null;
			selectedEbookBookId: number | null;
			pairId: string | null;
			totalCount: number;
	  })
	| {
			id: string;
			serverId: string;
			audiobookBookId: number;
			ebookBookId: number;
			score: null;
			confidence: null;
			reasons: string[];
			warnings: string[];
			matcherVersion: null;
			status: "decided";
			createdAt: string;
			updatedAt: string;
			origin: "manual";
			decisionAction: "approve";
			selectedEbookBookId: number;
			pairId: string;
			totalCount: number;
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
					isNull(book.duplicateOfBookId),
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
		const [ebookSeriesRows, audiobookSeriesRows] = await Promise.all([
			ebookIds.length
				? db
						.select({
							bookId: bookSeries.bookId,
							name: series.name,
							position: bookSeries.position,
						})
						.from(bookSeries)
						.innerJoin(series, eq(series.id, bookSeries.seriesId))
						.where(inArray(bookSeries.bookId, ebookIds))
				: Promise.resolve([]),
			audiobookIds.length
				? db
						.select({
							bookId: audiobookSeries.bookId,
							name: series.name,
							position: audiobookSeries.position,
						})
						.from(audiobookSeries)
						.innerJoin(series, eq(series.id, audiobookSeries.seriesId))
						.where(inArray(audiobookSeries.bookId, audiobookIds))
				: Promise.resolve([]),
		]);
		const seriesByBookId = new Map<
			number,
			{ name: string; position: number | null }[]
		>();
		for (const item of [...ebookSeriesRows, ...audiobookSeriesRows]) {
			const values = seriesByBookId.get(item.bookId) ?? [];
			values.push({ name: item.name, position: item.position });
			seriesByBookId.set(item.bookId, values);
		}

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
				series: seriesByBookId.get(row.id) ?? [],
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

	async createMatchProposals(
		inputs: {
			serverId: string;
			audiobookBookId: number;
			ebookBookId: number;
			score: number;
			confidence: ReadListenMatchProposalRow["confidence"];
			reasons: string[];
			warnings: string[];
			matcherVersion: string;
		}[],
	): Promise<void> {
		if (inputs.length === 0) return;
		await db
			.insert(readListenMatchProposal)
			.values(inputs)
			.onConflictDoNothing({
				target: [
					readListenMatchProposal.serverId,
					readListenMatchProposal.audiobookBookId,
					readListenMatchProposal.ebookBookId,
					readListenMatchProposal.matcherVersion,
				],
			});
	}

	async recordMatchEvaluation(input: {
		serverId: string;
		audiobookBookId: number;
		matcherVersion: string;
		candidateCount: number;
		proposalCount: number;
		maxScore: number | null;
	}): Promise<void> {
		await db
			.insert(readListenMatchEvaluation)
			.values(input)
			.onConflictDoNothing({
				target: [
					readListenMatchEvaluation.serverId,
					readListenMatchEvaluation.audiobookBookId,
					readListenMatchEvaluation.matcherVersion,
				],
			});
	}

	async listUnevaluatedCanonicalAudiobooks(
		serverId: string,
		scope: LibraryScope,
		matcherVersion: string,
		limit?: number,
	): Promise<ReadListenPublication[]> {
		let query = db
			.select({ id: book.id })
			.from(book)
			.innerJoin(library, eq(library.id, book.libraryId))
			.where(
				and(
					eq(library.serverId, serverId),
					eq(library.mediaType, "audiobook"),
					isNull(book.duplicateOfBookId),
					accessibleCondition(scope),
					notExists(
						db
							.select({ id: readListenPair.id })
							.from(readListenPair)
							.where(
								and(
									eq(readListenPair.serverId, serverId),
									eq(readListenPair.audiobookBookId, book.id),
								),
							),
					),
					notExists(
						db
							.select({ id: readListenMatchEvaluation.id })
							.from(readListenMatchEvaluation)
							.where(
								and(
									eq(readListenMatchEvaluation.serverId, serverId),
									eq(readListenMatchEvaluation.audiobookBookId, book.id),
									eq(readListenMatchEvaluation.matcherVersion, matcherVersion),
								),
							),
					),
				),
			)
			.orderBy(book.id)
			.$dynamic();
		if (limit !== undefined) query = query.limit(limit);
		const rows = await query;
		if (rows.length === 0) return [];
		const publications = await this.listPublications(
			inArray(
				book.id,
				rows.map((row) => row.id),
			),
			serverId,
			scope,
		);
		const byId = new Map(
			publications.map((publication) => [publication.id, publication]),
		);
		return rows
			.map((row) => byId.get(row.id))
			.filter(
				(publication): publication is ReadListenPublication =>
					publication !== undefined,
			);
	}

	async createMatchAnalysisAttempt(input: {
		taskId: string;
		serverId: string;
		requestedByUserId: string;
		matcherVersion: string;
		candidateCount: number;
	}): Promise<{ analysis: ReadListenMatchAnalysisRow; reused: boolean }> {
		const [created] = await db
			.insert(readListenMatchAnalysis)
			.values(input)
			.onConflictDoNothing({
				target: [
					readListenMatchAnalysis.serverId,
					readListenMatchAnalysis.requestedByUserId,
					readListenMatchAnalysis.matcherVersion,
				],
				where: sql`${readListenMatchAnalysis.status} in ('queued', 'running')`,
			})
			.returning();
		if (created) return { analysis: created, reused: false };

		const [existing] = await db
			.select()
			.from(readListenMatchAnalysis)
			.where(
				and(
					eq(readListenMatchAnalysis.serverId, input.serverId),
					eq(
						readListenMatchAnalysis.requestedByUserId,
						input.requestedByUserId,
					),
					eq(readListenMatchAnalysis.matcherVersion, input.matcherVersion),
					inArray(readListenMatchAnalysis.status, ["queued", "running"]),
				),
			)
			.orderBy(desc(readListenMatchAnalysis.createdAt))
			.limit(1);
		if (!existing) {
			throw new Error("Read & Listen match analysis conflict was unresolved");
		}
		return { analysis: existing, reused: true };
	}

	async updateMatchAnalysisStatus(
		taskId: string,
		status: ReadListenMatchAnalysisRow["status"],
		error?: string,
	): Promise<ReadListenMatchAnalysisRow | null> {
		const terminal = ["completed", "failed", "cancelled"].includes(status);
		const [row] = await db
			.update(readListenMatchAnalysis)
			.set({
				status,
				...(status === "running"
					? {
							startedAt: sql`coalesce(${readListenMatchAnalysis.startedAt}, now())`,
						}
					: {}),
				...(terminal ? { finishedAt: new Date().toISOString() } : {}),
				...(error ? { error: error.slice(0, 2_000) } : {}),
				updatedAt: new Date().toISOString(),
			})
			.where(eq(readListenMatchAnalysis.taskId, taskId))
			.returning();
		return row ?? null;
	}

	async recordMatchAnalysisJobOutcome(input: {
		analysisId: string;
		audiobookUuid: string;
		outcome: "completed" | "skipped" | "failed";
		proposalCount?: number;
		error?: string;
	}): Promise<ReadListenMatchAnalysisRow | null> {
		return db.transaction(async (tx) => {
			const [recorded] = await tx
				.insert(readListenMatchAnalysisOutcome)
				.values({
					analysisId: input.analysisId,
					audiobookUuid: input.audiobookUuid,
					outcome: input.outcome,
					proposalCount: input.proposalCount ?? 0,
					error: input.error?.slice(0, 2_000),
				})
				.onConflictDoNothing({
					target: [
						readListenMatchAnalysisOutcome.analysisId,
						readListenMatchAnalysisOutcome.audiobookUuid,
					],
				})
				.returning({ id: readListenMatchAnalysisOutcome.id });
			if (!recorded) {
				const [existing] = await tx
					.select()
					.from(readListenMatchAnalysis)
					.where(eq(readListenMatchAnalysis.id, input.analysisId))
					.limit(1);
				return existing ?? null;
			}

			const increment = sql`${sql.identifier(
				input.outcome === "completed"
					? "completed_count"
					: input.outcome === "skipped"
						? "skipped_count"
						: "failed_count",
			)} + 1`;
			const field =
				input.outcome === "completed"
					? { completedCount: increment }
					: input.outcome === "skipped"
						? { skippedCount: increment }
						: { failedCount: increment };
			const [updated] = await tx
				.update(readListenMatchAnalysis)
				.set({
					...field,
					status: "running",
					startedAt: sql`coalesce(${readListenMatchAnalysis.startedAt}, now())`,
					proposalCount: sql`${readListenMatchAnalysis.proposalCount} + ${input.proposalCount ?? 0}`,
					...(input.error
						? {
								error: sql`coalesce(${readListenMatchAnalysis.error}, ${input.error.slice(0, 2_000)})`,
							}
						: {}),
					updatedAt: new Date().toISOString(),
				})
				.where(
					and(
						eq(readListenMatchAnalysis.id, input.analysisId),
						inArray(readListenMatchAnalysis.status, ["queued", "running"]),
					),
				)
				.returning();
			if (!updated) return null;
			const settled =
				updated.completedCount + updated.skippedCount + updated.failedCount;
			if (settled < updated.candidateCount) return updated;
			const finalStatus = updated.failedCount > 0 ? "failed" : "completed";
			const [completed] = await tx
				.update(readListenMatchAnalysis)
				.set({
					status: finalStatus,
					finishedAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				})
				.where(
					and(
						eq(readListenMatchAnalysis.id, input.analysisId),
						inArray(readListenMatchAnalysis.status, ["queued", "running"]),
					),
				)
				.returning();
			return completed ?? updated;
		});
	}

	async listMatchProposalRows(
		serverId: string,
		options: {
			status?: "pending" | "decided" | "superseded";
			matcherVersion?: string;
			audiobookBookId?: number;
			offset?: number;
			limit?: number;
		} = {},
	): Promise<ReadListenMatchProposalRow[]> {
		return db
			.select()
			.from(readListenMatchProposal)
			.where(
				and(
					eq(readListenMatchProposal.serverId, serverId),
					options.status
						? eq(readListenMatchProposal.status, options.status)
						: undefined,
					options.matcherVersion
						? eq(readListenMatchProposal.matcherVersion, options.matcherVersion)
						: undefined,
					options.audiobookBookId !== undefined
						? eq(
								readListenMatchProposal.audiobookBookId,
								options.audiobookBookId,
							)
						: undefined,
				),
			)
			.orderBy(
				desc(readListenMatchProposal.score),
				readListenMatchProposal.createdAt,
			)
			.offset(options.offset ?? 0)
			.limit(options.limit ?? 50);
	}

	async listMatchProposalPage(
		serverId: string,
		scope: LibraryScope,
		options: {
			status: "pending" | "decided" | "superseded";
			matcherVersion?: string;
			query?: string;
			offset: number;
			limit: number;
		},
	): Promise<ReadListenMatchProposalPageRow[]> {
		const query = options.query?.trim();
		const audiobookScope = accessiblePredicateSql(scope, "ab");
		const ebookScope = accessiblePredicateSql(scope, "eb");
		const selectedEbookScope = accessiblePredicateSql(scope, "selected_ebook");
		if (options.status === "decided") {
			const { rows } = await db.execute(sql`
				WITH reviewed AS (
					SELECT
						p.id,
						p.server_id AS "serverId",
						p.audiobook_book_id::float8 AS "audiobookBookId",
						p.ebook_book_id::float8 AS "ebookBookId",
						p.score,
						p.confidence,
						p.reasons,
						p.warnings,
						p.matcher_version AS "matcherVersion",
						p.status,
						p.created_at AS "createdAt",
						p.updated_at AS "updatedAt",
						'matcher'::text AS origin,
						d.action AS "decisionAction",
						d.selected_ebook_book_id::float8 AS "selectedEbookBookId",
						rp.id AS "pairId"
					FROM read_listen_match_proposal p
					JOIN book ab ON ab.id = p.audiobook_book_id
					JOIN library al ON al.id = ab.library_id
					JOIN book eb ON eb.id = p.ebook_book_id
					JOIN library el ON el.id = eb.library_id
					LEFT JOIN audiobook_metadata am ON am.book_id = ab.id
					LEFT JOIN book_metadata bm ON bm.book_id = eb.id
					LEFT JOIN read_listen_match_decision d ON d.proposal_id = p.id
					LEFT JOIN book selected_ebook ON selected_ebook.id = d.selected_ebook_book_id
					LEFT JOIN library selected_el ON selected_el.id = selected_ebook.library_id
					LEFT JOIN book_metadata selected_bm ON selected_bm.book_id = selected_ebook.id
					LEFT JOIN read_listen_pair rp
						ON rp.server_id = p.server_id
						AND rp.audiobook_book_id = p.audiobook_book_id
						AND rp.ebook_book_id = d.selected_ebook_book_id
					WHERE p.server_id = ${serverId}
						AND p.status = 'decided'
						AND al.server_id = ${serverId}
						AND el.server_id = ${serverId}
						AND ${visibleBookSql("ab")}
						AND ${visibleBookSql("eb")}
						${options.matcherVersion ? sql`AND p.matcher_version = ${options.matcherVersion}` : sql``}
						${audiobookScope ? sql`AND ${audiobookScope}` : sql``}
						${ebookScope ? sql`AND ${ebookScope}` : sql``}
						AND (
							d.selected_ebook_book_id IS NULL
							OR (
								selected_el.server_id = ${serverId}
								AND ${visibleBookSql("selected_ebook")}
								${selectedEbookScope ? sql`AND ${selectedEbookScope}` : sql``}
							)
						)
						${
							query
								? sql`AND (
									COALESCE(am.title, ab.filename) ILIKE ${`%${query}%`}
									OR ab.filename ILIKE ${`%${query}%`}
									OR COALESCE(bm.title, eb.filename) ILIKE ${`%${query}%`}
									OR eb.filename ILIKE ${`%${query}%`}
									OR COALESCE(selected_bm.title, selected_ebook.filename) ILIKE ${`%${query}%`}
								)`
								: sql``
						}

					UNION ALL

					SELECT
						rp.id,
						rp.server_id AS "serverId",
						rp.audiobook_book_id::float8 AS "audiobookBookId",
						rp.ebook_book_id::float8 AS "ebookBookId",
						NULL::integer AS score,
						NULL::read_listen_match_confidence AS confidence,
						'[]'::jsonb AS reasons,
						'[]'::jsonb AS warnings,
						NULL::varchar AS "matcherVersion",
						'decided'::read_listen_match_proposal_status AS status,
						rp.created_at AS "createdAt",
						rp.updated_at AS "updatedAt",
						'manual'::text AS origin,
						'approve'::read_listen_match_decision_action AS "decisionAction",
						rp.ebook_book_id::float8 AS "selectedEbookBookId",
						rp.id AS "pairId"
					FROM read_listen_pair rp
					JOIN book ab ON ab.id = rp.audiobook_book_id
					JOIN library al ON al.id = ab.library_id
					JOIN book eb ON eb.id = rp.ebook_book_id
					JOIN library el ON el.id = eb.library_id
					LEFT JOIN audiobook_metadata am ON am.book_id = ab.id
					LEFT JOIN book_metadata bm ON bm.book_id = eb.id
					WHERE rp.server_id = ${serverId}
						AND al.server_id = ${serverId}
						AND el.server_id = ${serverId}
						AND ${visibleBookSql("ab")}
						AND ${visibleBookSql("eb")}
						${audiobookScope ? sql`AND ${audiobookScope}` : sql``}
						${ebookScope ? sql`AND ${ebookScope}` : sql``}
						${
							query
								? sql`AND (
									COALESCE(am.title, ab.filename) ILIKE ${`%${query}%`}
									OR ab.filename ILIKE ${`%${query}%`}
									OR COALESCE(bm.title, eb.filename) ILIKE ${`%${query}%`}
									OR eb.filename ILIKE ${`%${query}%`}
								)`
								: sql``
						}
						AND NOT EXISTS (
							SELECT 1
							FROM read_listen_match_proposal existing_p
							JOIN read_listen_match_decision existing_d
								ON existing_d.proposal_id = existing_p.id
							WHERE existing_p.server_id = rp.server_id
								AND existing_p.status = 'decided'
								AND existing_p.audiobook_book_id = rp.audiobook_book_id
								AND existing_d.selected_ebook_book_id = rp.ebook_book_id
								AND existing_d.action IN ('approve', 'correct')
						)
				)
				SELECT
					reviewed.*,
					count(*) OVER ()::int AS "totalCount"
				FROM reviewed
				ORDER BY "updatedAt" DESC, id ASC
				LIMIT ${options.limit}
				OFFSET ${options.offset}
			`);
			return rows as ReadListenMatchProposalPageRow[];
		}
		const order =
			options.status === "pending"
				? sql`p.score DESC, p.created_at ASC, p.id ASC`
				: sql`p.updated_at DESC, p.id ASC`;
		const { rows } = await db.execute(sql`
			SELECT
				p.id,
				p.server_id AS "serverId",
				p.audiobook_book_id::float8 AS "audiobookBookId",
				p.ebook_book_id::float8 AS "ebookBookId",
				p.score,
				p.confidence,
				p.reasons,
				p.warnings,
				p.matcher_version AS "matcherVersion",
				p.status,
				p.created_at AS "createdAt",
				p.updated_at AS "updatedAt",
				'matcher'::text AS origin,
				d.action AS "decisionAction",
				d.selected_ebook_book_id::float8 AS "selectedEbookBookId",
				rp.id AS "pairId",
				count(*) OVER ()::int AS "totalCount"
			FROM read_listen_match_proposal p
			JOIN book ab ON ab.id = p.audiobook_book_id
			JOIN library al ON al.id = ab.library_id
			JOIN book eb ON eb.id = p.ebook_book_id
			JOIN library el ON el.id = eb.library_id
			LEFT JOIN audiobook_metadata am ON am.book_id = ab.id
			LEFT JOIN book_metadata bm ON bm.book_id = eb.id
			LEFT JOIN read_listen_match_decision d ON d.proposal_id = p.id
			LEFT JOIN book selected_ebook ON selected_ebook.id = d.selected_ebook_book_id
			LEFT JOIN library selected_el ON selected_el.id = selected_ebook.library_id
			LEFT JOIN book_metadata selected_bm ON selected_bm.book_id = selected_ebook.id
			LEFT JOIN read_listen_pair rp
				ON rp.server_id = p.server_id
				AND rp.audiobook_book_id = p.audiobook_book_id
				AND rp.ebook_book_id = d.selected_ebook_book_id
			WHERE p.server_id = ${serverId}
				AND p.status = ${options.status}
				AND al.server_id = ${serverId}
				AND el.server_id = ${serverId}
				AND ${visibleBookSql("ab")}
				AND ${visibleBookSql("eb")}
				${options.matcherVersion ? sql`AND p.matcher_version = ${options.matcherVersion}` : sql``}
				${audiobookScope ? sql`AND ${audiobookScope}` : sql``}
				${ebookScope ? sql`AND ${ebookScope}` : sql``}
				AND (
					d.selected_ebook_book_id IS NULL
					OR (
						selected_el.server_id = ${serverId}
						AND ${visibleBookSql("selected_ebook")}
						${selectedEbookScope ? sql`AND ${selectedEbookScope}` : sql``}
					)
				)
				${
					query
						? sql`AND (
							COALESCE(am.title, ab.filename) ILIKE ${`%${query}%`}
							OR ab.filename ILIKE ${`%${query}%`}
							OR COALESCE(bm.title, eb.filename) ILIKE ${`%${query}%`}
							OR eb.filename ILIKE ${`%${query}%`}
							OR COALESCE(selected_bm.title, selected_ebook.filename) ILIKE ${`%${query}%`}
						)`
						: sql``
				}
			ORDER BY ${order}
			LIMIT ${options.limit}
			OFFSET ${options.offset}
		`);
		return rows as ReadListenMatchProposalPageRow[];
	}

	async getMatchProposalRow(
		id: string,
		serverId: string,
	): Promise<ReadListenMatchProposalRow | null> {
		const [row] = await db
			.select()
			.from(readListenMatchProposal)
			.where(
				and(
					eq(readListenMatchProposal.id, id),
					eq(readListenMatchProposal.serverId, serverId),
				),
			)
			.limit(1);
		return row ?? null;
	}

	async decideMatchProposals(
		inputs: Array<{
			proposal: ReadListenMatchProposalRow;
			action: "approve" | "reject" | "correct";
			selectedEbookBookId: number | null;
			decidedByUserId: string;
		}>,
	): Promise<
		Array<{
			decision: ReadListenMatchDecisionRow;
			pair: ReadListenPairRow | null;
		}>
	> {
		return db.transaction(async (tx) => {
			const outcomes: Array<{
				decision: ReadListenMatchDecisionRow;
				pair: ReadListenPairRow | null;
			}> = [];
			for (const input of inputs) {
				const [decision] = await tx
					.insert(readListenMatchDecision)
					.values({
						proposalId: input.proposal.id,
						action: input.action,
						selectedEbookBookId: input.selectedEbookBookId,
						decidedByUserId: input.decidedByUserId,
					})
					.onConflictDoNothing({ target: readListenMatchDecision.proposalId })
					.returning();
				if (!decision) {
					throw new Error("Read & Listen match proposal was already decided");
				}

				let pair: ReadListenPairRow | null = null;
				if (input.selectedEbookBookId !== null) {
					const [created] = await tx
						.insert(readListenPair)
						.values({
							serverId: input.proposal.serverId,
							ebookBookId: input.selectedEbookBookId,
							audiobookBookId: input.proposal.audiobookBookId,
							createdByUserId: input.decidedByUserId,
						})
						.onConflictDoNothing({
							target: [
								readListenPair.ebookBookId,
								readListenPair.audiobookBookId,
							],
						})
						.returning();
					if (!created) throw new Error("Read & Listen pair already exists");
					pair = created;
				}

				const [updated] = await tx
					.update(readListenMatchProposal)
					.set({ status: "decided", updatedAt: new Date().toISOString() })
					.where(
						and(
							eq(readListenMatchProposal.id, input.proposal.id),
							eq(readListenMatchProposal.status, "pending"),
						),
					)
					.returning({ id: readListenMatchProposal.id });
				if (!updated)
					throw new Error("Read & Listen match proposal was already decided");
				if (input.selectedEbookBookId !== null) {
					await tx
						.update(readListenMatchProposal)
						.set({
							status: "superseded",
							updatedAt: new Date().toISOString(),
						})
						.where(
							and(
								eq(readListenMatchProposal.serverId, input.proposal.serverId),
								eq(
									readListenMatchProposal.audiobookBookId,
									input.proposal.audiobookBookId,
								),
								eq(readListenMatchProposal.status, "pending"),
							),
						);
				}
				outcomes.push({ decision, pair });
			}
			return outcomes;
		});
	}

	async deleteReviewedMatches(
		ids: string[],
		serverId: string,
	): Promise<number> {
		return db.transaction(async (tx) => {
			let removed = 0;
			for (const id of ids) {
				const [proposal] = await tx
					.select({
						id: readListenMatchProposal.id,
						audiobookBookId: readListenMatchProposal.audiobookBookId,
						selectedEbookBookId: readListenMatchDecision.selectedEbookBookId,
					})
					.from(readListenMatchProposal)
					.leftJoin(
						readListenMatchDecision,
						eq(readListenMatchDecision.proposalId, readListenMatchProposal.id),
					)
					.where(
						and(
							eq(readListenMatchProposal.id, id),
							eq(readListenMatchProposal.serverId, serverId),
							inArray(readListenMatchProposal.status, ["pending", "decided"]),
						),
					)
					.limit(1);

				if (proposal) {
					if (proposal.selectedEbookBookId !== null) {
						await tx
							.delete(readListenPair)
							.where(
								and(
									eq(readListenPair.serverId, serverId),
									eq(readListenPair.audiobookBookId, proposal.audiobookBookId),
									eq(readListenPair.ebookBookId, proposal.selectedEbookBookId),
								),
							);
					}
					await tx
						.delete(readListenMatchProposal)
						.where(eq(readListenMatchProposal.id, proposal.id));
					await tx
						.update(readListenMatchProposal)
						.set({
							status: "pending",
							updatedAt: new Date().toISOString(),
						})
						.where(
							and(
								eq(readListenMatchProposal.serverId, serverId),
								eq(
									readListenMatchProposal.audiobookBookId,
									proposal.audiobookBookId,
								),
								eq(readListenMatchProposal.status, "superseded"),
							),
						);
					await tx
						.delete(readListenMatchEvaluation)
						.where(
							and(
								eq(readListenMatchEvaluation.serverId, serverId),
								eq(
									readListenMatchEvaluation.audiobookBookId,
									proposal.audiobookBookId,
								),
							),
						);
					removed += 1;
					continue;
				}

				const [manualPair] = await tx
					.delete(readListenPair)
					.where(
						and(
							eq(readListenPair.id, id),
							eq(readListenPair.serverId, serverId),
						),
					)
					.returning({ audiobookBookId: readListenPair.audiobookBookId });
				if (!manualPair)
					throw new Error("Reviewed Read & Listen match not found");
				await tx
					.delete(readListenMatchEvaluation)
					.where(
						and(
							eq(readListenMatchEvaluation.serverId, serverId),
							eq(
								readListenMatchEvaluation.audiobookBookId,
								manualPair.audiobookBookId,
							),
						),
					);
				removed += 1;
			}
			return removed;
		});
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

	async deletePairAndMatchHistory(
		id: string,
		serverId: string,
	): Promise<boolean> {
		return db.transaction(async (tx) => {
			const [deletedPair] = await tx
				.delete(readListenPair)
				.where(
					and(eq(readListenPair.id, id), eq(readListenPair.serverId, serverId)),
				)
				.returning({
					audiobookBookId: readListenPair.audiobookBookId,
					ebookBookId: readListenPair.ebookBookId,
				});
			if (!deletedPair) return false;

			await tx
				.delete(readListenMatchProposal)
				.where(
					and(
						eq(readListenMatchProposal.serverId, serverId),
						eq(
							readListenMatchProposal.audiobookBookId,
							deletedPair.audiobookBookId,
						),
						inArray(
							readListenMatchProposal.id,
							tx
								.select({ proposalId: readListenMatchDecision.proposalId })
								.from(readListenMatchDecision)
								.where(
									eq(
										readListenMatchDecision.selectedEbookBookId,
										deletedPair.ebookBookId,
									),
								),
						),
					),
				);

			await tx
				.delete(readListenMatchEvaluation)
				.where(
					and(
						eq(readListenMatchEvaluation.serverId, serverId),
						eq(
							readListenMatchEvaluation.audiobookBookId,
							deletedPair.audiobookBookId,
						),
					),
				);

			return true;
		});
	}
}

export const readListenRepository = new ReadListenRepository();
