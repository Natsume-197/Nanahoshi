import path from "node:path";
import {
	ConflictError,
	InternalServerError,
	NotFoundError,
} from "../../errors";
import { fetchBookRelatedEntities } from "../../infrastructure/search/catalog-relations";
import { logger } from "../../lib/logger";
import {
	enqueueBookEnrich,
	findMemberToPromote,
	regroupBookDuplicates,
} from "../../modules/duplicateGrouping";
import { scannedFileRepository } from "../../modules/scanning/scannedFile.repository";
import { audiobookRepository } from "../audiobooks/audiobook.repository";
import { enrichmentStateRepository } from "../enrichment/enrichment.repository";
import { bookRepository, type LibraryScope } from "./book.repository";
import {
	deleteBookSource,
	UnsafeBookSourceError,
} from "./book-source-deletion";
import { bookMetadataRepository } from "./metadata/metadata.repository";

const log = logger.child({ component: "book-deletion" });

type BookRecord = NonNullable<
	Awaited<ReturnType<typeof bookRepository.getByRelativePath>>
>;

export async function removeCatalogBook(
	existing: BookRecord,
	serverId?: string,
): Promise<boolean> {
	const relatedEntities = await fetchBookRelatedEntities(existing.id).catch(
		() => undefined,
	);
	const promote = await findMemberToPromote(existing.id).catch(() => null);
	const removed = await bookRepository.removeBook(existing.id);
	if (!removed) return false;

	if (promote) {
		await regroupBookDuplicates(promote.id).catch((error) =>
			log.error(
				{ err: error, bookId: promote.id },
				"Regroup-on-promote failed",
			),
		);
		if (
			serverId &&
			(await enrichmentStateRepository.shouldReopenAfterDuplicateRelease(
				promote.id,
			))
		) {
			await enqueueBookEnrich(promote.id, promote.uuid).catch((error) =>
				log.error(
					{ err: error, bookId: promote.id },
					"Enrich enqueue failed for promoted book",
				),
			);
		}
	}

	if (relatedEntities) {
		await Promise.all([
			...relatedEntities.authorIds.map((id) =>
				bookMetadataRepository.deleteAuthorIfOrphaned(id),
			),
			...relatedEntities.seriesIds.map((id) =>
				bookMetadataRepository.deleteSeriesIfOrphaned(id),
			),
		]).catch((error) =>
			log.error({ err: error, bookId: existing.id }, "Entity cleanup failed"),
		);
	}

	return true;
}

export async function removeCatalogBookByRelativePath(
	relativePath: string,
	libraryPathId: number,
	serverId?: string,
): Promise<boolean> {
	const existing = await bookRepository.getByRelativePath(
		relativePath,
		libraryPathId,
	);
	if (!existing) return false;
	return removeCatalogBook(existing, serverId);
}

export async function deleteBookPermanently(
	uuid: string,
	serverId: string,
	scope: LibraryScope,
): Promise<{ deletedPaths: number; sourceWasMissing: boolean }> {
	const source = await bookRepository.getDeletionSource(uuid, serverId, scope);
	if (!source) throw new NotFoundError("Book not found");

	const audioFiles =
		source.libraryMediaType === "audiobook"
			? await audiobookRepository.listAudioFiles(source.id)
			: [];
	const rawPaths =
		audioFiles.length > 0
			? audioFiles.map((file) =>
					path.isAbsolute(file.path)
						? file.path
						: path.resolve(source.libraryRoot, file.path),
				)
			: [path.resolve(source.libraryRoot, source.relativePath)];
	const uniquePaths = [
		...new Set(rawPaths.map((filePath) => path.resolve(filePath))),
	];
	let deletionResult: Awaited<ReturnType<typeof deleteBookSource>>;
	try {
		deletionResult = await deleteBookSource({
			libraryRoot: source.libraryRoot,
			sourcePaths: uniquePaths,
			pruneEmptyDirectories: source.libraryMediaType === "audiobook",
		});
	} catch (error) {
		if (error instanceof UnsafeBookSourceError) {
			throw new ConflictError(error.message);
		}
		log.error({ err: error, bookId: source.id }, "Source deletion failed");
		throw new InternalServerError(
			"Unable to delete the book file. Check the library folder permissions and try again.",
		);
	}

	try {
		await scannedFileRepository.deleteByPaths(
			uniquePaths,
			source.libraryPathId,
		);
		const existing = await bookRepository.getById(source.id);
		if (existing) {
			const removed = await removeCatalogBook(existing, serverId);
			if (!removed && (await bookRepository.getById(source.id))) {
				throw new Error("Book row could not be removed");
			}
		}
	} catch (error) {
		log.error({ err: error, bookId: source.id }, "Catalog cleanup failed");
		throw new InternalServerError(
			"The file was deleted, but Nanahoshi could not finish catalog cleanup. Try again or run a library scan.",
		);
	}

	return {
		deletedPaths: deletionResult.deletedPaths.length,
		sourceWasMissing: deletionResult.sourceWasMissing,
	};
}
