import { BadRequestError, NotFoundError } from "../../errors";
import {
	fetchRelatedEntitiesByLibraryId,
	fetchRelatedEntitiesByLibraryPathId,
} from "../../infrastructure/search/search.document";
import {
	enqueueBulkEntitySync,
	enqueueSearchSync,
} from "../../infrastructure/search/search-sync.service";
import { logger } from "../../lib/logger";
import { removeConvertedFile } from "../../modules/conversion/converter";
import { scanPathLibrary } from "../../modules/libraryScanner";
import {
	createTask,
	finalizeTask,
	LIBRARY_SCAN_TASK_TYPE,
} from "../../modules/taskManager";
import { bookRepository } from "../books/book.repository";
import { bookMetadataRepository } from "../books/metadata/metadata.repository";
import type { CreateLibraryInput } from "./library.model";
import { libraryRepository } from "./library.repository";

export const createLibrary = async (
	input: Omit<CreateLibraryInput, "organizationId" | "id" | "createdAt"> & {
		paths?: string[];
	},
	organizationId: string,
) => {
	return await libraryRepository.create(input, organizationId);
};

export const getLibraries = async (organizationId: string) => {
	return await libraryRepository.findByOrganization(organizationId);
};

export const getLibraryById = async (id: number) => {
	const library = await libraryRepository.findById(id);
	if (!library) throw new NotFoundError("Library not found");
	return library;
};

export const addPath = async (libraryId: number, path: string) => {
	return await libraryRepository.addPath({
		libraryId,
		path,
		isEnabled: true,
	});
};

export const removePath = async (pathId: number) => {
	// Fetch related entities and book IDs before cascade delete
	const [relatedEntities, books] = await Promise.all([
		fetchRelatedEntitiesByLibraryPathId(pathId),
		bookRepository.getIdsByLibraryPathId(pathId),
	]);

	const deleted = await libraryRepository.removePath(pathId);
	if (!deleted) throw new NotFoundError("Path not found or already deleted");

	// Clean up converted files, sync search index, and delete orphaned entities
	await Promise.all([
		...books.map(({ id, uuid }) =>
			Promise.all([
				removeConvertedFile(uuid).catch((err) =>
					logger.error(
						{ err, bookId: id },
						"[Library] Converted file cleanup failed",
					),
				),
				enqueueSearchSync(id, "delete").catch((err) =>
					logger.error(
						{ err, bookId: id },
						"[Library] Search sync delete failed",
					),
				),
			]),
		),
		enqueueBulkEntitySync(relatedEntities).catch((err) =>
			logger.error({ err }, "[Library] Bulk entity sync failed"),
		),
		...relatedEntities.authorIds.map((id) =>
			bookMetadataRepository
				.deleteAuthorIfOrphaned(id)
				.catch((err) =>
					logger.error(
						{ err, authorId: id },
						"[Library] Orphan author cleanup failed",
					),
				),
		),
		...relatedEntities.seriesIds.map((id) =>
			bookMetadataRepository
				.deleteSeriesIfOrphaned(id)
				.catch((err) =>
					logger.error(
						{ err, seriesId: id },
						"[Library] Orphan series cleanup failed",
					),
				),
		),
	]);

	return { success: true };
};

export const updateLibrary = async (
	id: number,
	data: { name?: string; isCronWatch?: boolean; isPublic?: boolean },
) => {
	const updated = await libraryRepository.update(id, data);
	if (!updated) throw new NotFoundError("Library not found");
	return updated;
};

export const deleteLibrary = async (libraryId: number) => {
	// Fetch related entities and book IDs before cascade delete
	const [relatedEntities, books] = await Promise.all([
		fetchRelatedEntitiesByLibraryId(libraryId),
		bookRepository.getIdsByLibraryId(libraryId),
	]);

	const deleted = await libraryRepository.delete(libraryId);
	if (!deleted) throw new NotFoundError("Library not found or already deleted");

	// Clean up converted files, sync search index, and delete orphaned entities
	await Promise.all([
		...books.map(({ id, uuid }) =>
			Promise.all([
				removeConvertedFile(uuid).catch((err) =>
					logger.error(
						{ err, bookId: id },
						"[Library] Converted file cleanup failed",
					),
				),
				enqueueSearchSync(id, "delete").catch((err) =>
					logger.error(
						{ err, bookId: id },
						"[Library] Search sync delete failed",
					),
				),
			]),
		),
		enqueueBulkEntitySync(relatedEntities).catch((err) =>
			logger.error({ err }, "[Library] Bulk entity sync failed"),
		),
		...relatedEntities.authorIds.map((id) =>
			bookMetadataRepository
				.deleteAuthorIfOrphaned(id)
				.catch((err) =>
					logger.error(
						{ err, authorId: id },
						"[Library] Orphan author cleanup failed",
					),
				),
		),
		...relatedEntities.seriesIds.map((id) =>
			bookMetadataRepository
				.deleteSeriesIfOrphaned(id)
				.catch((err) =>
					logger.error(
						{ err, seriesId: id },
						"[Library] Orphan series cleanup failed",
					),
				),
		),
	]);

	return { success: true };
};

export const scanLibrary = async (libraryId: number) => {
	const library = await libraryRepository.findById(libraryId);
	if (!library) throw new NotFoundError("Library not found");

	const paths = library.paths;
	if (!paths || paths.length === 0) {
		throw new BadRequestError("This library has no paths configured");
	}

	const task = await createTask({
		type: LIBRARY_SCAN_TASK_TYPE,
		label: `Scanning ${library.name}`,
		queue: "file-events",
	});

	(async () => {
		// Sequential on purpose: dedupe runs library-wide, so two paths of the
		// same library must not be scanned concurrently.
		for (const pathObj of paths) {
			try {
				await scanPathLibrary(
					pathObj.path,
					library.id,
					pathObj.id,
					task.id,
					library.mediaType,
				);
			} catch (error) {
				logger.error(
					{ err: error, path: pathObj.path },
					"Error scanning library path",
				);
			}
		}
		// Every file event is enqueued: the task can now finish by counting
		await finalizeTask(task.id).catch((err) =>
			logger.error({ err, taskId: task.id }, "Failed to finalize scan task"),
		);
	})();

	return { success: true, message: "Library scan started" };
};
