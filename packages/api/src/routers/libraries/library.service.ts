import { BadRequestError, NotFoundError } from "../../errors";
import { enqueueSearchSync } from "../../infrastructure/search/search-sync.service";
import { logger } from "../../lib/logger";
import { removeConvertedFile } from "../../modules/conversion/converter";
import { scanPathLibrary } from "../../modules/libraryScanner";
import { createTask } from "../../modules/taskManager";
import { bookRepository } from "../books/book.repository";
import type { CreateLibraryInput } from "./library.model";
import { libraryRepository } from "./library.repository";

export const createLibrary = async (
	input: CreateLibraryInput & { paths?: string[] },
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
	// Get book IDs before cascade delete removes them
	const books = await bookRepository.getIdsByLibraryPathId(pathId);
	const deleted = await libraryRepository.removePath(pathId);
	if (!deleted) throw new NotFoundError("Path not found or already deleted");

	// Clean up converted files and sync search index for deleted books
	for (const { id, uuid } of books) {
		await removeConvertedFile(uuid).catch((err) =>
			logger.error({ err, bookId: id }, "[Library] Converted file cleanup failed"),
		);
		await enqueueSearchSync(id, "delete").catch((err) =>
			logger.error({ err, bookId: id }, "[Library] Search sync delete failed"),
		);
	}

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
	// Get book IDs before cascade delete removes them
	const books = await bookRepository.getIdsByLibraryId(libraryId);
	const deleted = await libraryRepository.delete(libraryId);
	if (!deleted) throw new NotFoundError("Library not found or already deleted");

	// Clean up converted files and sync search index for deleted books
	for (const { id, uuid } of books) {
		await removeConvertedFile(uuid).catch((err) =>
			logger.error({ err, bookId: id }, "[Library] Converted file cleanup failed"),
		);
		await enqueueSearchSync(id, "delete").catch((err) =>
			logger.error({ err, bookId: id }, "[Library] Search sync delete failed"),
		);
	}

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
		type: "library-scan",
		label: `Scanning ${library.name}`,
	});

	(async () => {
		await Promise.all(
			paths.map(async (pathObj) => {
				try {
					await scanPathLibrary(pathObj.path, library.id, pathObj.id, task.id);
				} catch (error) {
					logger.error(
						{ err: error, path: pathObj.path },
						"Error scanning library path",
					);
				}
			}),
		);
	})();

	return { success: true, message: "Library scan started" };
};
