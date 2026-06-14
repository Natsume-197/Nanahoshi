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

export const getLibraries = async (
	organizationId: string,
	accessibleLibraryIds: number[] | "ALL",
) => {
	const libraries = await libraryRepository.findByOrganization(organizationId);
	if (accessibleLibraryIds === "ALL") return libraries;
	const allowed = new Set(accessibleLibraryIds);
	return libraries.filter((l) => allowed.has(l.id));
};

export const getLibraryById = async (
	id: number,
	organizationId: string,
	accessibleLibraryIds: number[] | "ALL",
) => {
	if (accessibleLibraryIds !== "ALL" && !accessibleLibraryIds.includes(id)) {
		throw new NotFoundError("Library not found");
	}
	const library = await libraryRepository.findById(id, organizationId);
	if (!library) throw new NotFoundError("Library not found");
	return library;
};

export const addPath = async (
	libraryId: number,
	path: string,
	organizationId: string,
) => {
	const owned = await libraryRepository.findById(libraryId, organizationId);
	if (!owned) throw new NotFoundError("Library not found");
	return await libraryRepository.addPath({
		libraryId,
		path,
		isEnabled: true,
	});
};

export const removePath = async (pathId: number, organizationId: string) => {
	const ownedLibraryId = await libraryRepository.findLibraryIdForPath(
		pathId,
		organizationId,
	);
	if (!ownedLibraryId)
		throw new NotFoundError("Path not found or already deleted");

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
	data: {
		name?: string;
		isCronWatch?: boolean;
		isPublic?: boolean;
		metadataProviders?: string[];
	},
	organizationId: string,
) => {
	const updated = await libraryRepository.update(id, data, organizationId);
	if (!updated) throw new NotFoundError("Library not found");
	return updated;
};

export const deleteLibrary = async (
	libraryId: number,
	organizationId: string,
) => {
	const owned = await libraryRepository.findById(libraryId, organizationId);
	if (!owned) throw new NotFoundError("Library not found or already deleted");

	// Fetch related entities and book IDs before cascade delete
	const [relatedEntities, books] = await Promise.all([
		fetchRelatedEntitiesByLibraryId(libraryId),
		bookRepository.getIdsByLibraryId(libraryId),
	]);

	const deleted = await libraryRepository.delete(libraryId, organizationId);
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

export const scanLibrary = async (
	libraryId: number,
	organizationId: string,
) => {
	const library = await libraryRepository.findById(libraryId, organizationId);
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
