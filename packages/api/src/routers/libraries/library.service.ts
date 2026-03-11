import { BadRequestError, NotFoundError } from "../../errors";
import { logger } from "../../lib/logger";
import { scanPathLibrary } from "../../modules/libraryScanner";
import { createTask } from "../../modules/taskManager";
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
	if (!library)
		throw new NotFoundError("Library not found");
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
	const deleted = await libraryRepository.removePath(pathId);
	if (!deleted)
		throw new NotFoundError("Path not found or already deleted");
	return { success: true };
};

export const updateLibrary = async (
	id: number,
	data: { name?: string; isCronWatch?: boolean; isPublic?: boolean },
) => {
	const updated = await libraryRepository.update(id, data);
	if (!updated)
		throw new NotFoundError("Library not found");
	return updated;
};

export const deleteLibrary = async (id: number) => {
	const deleted = await libraryRepository.delete(id);
	if (!deleted)
		throw new NotFoundError("Library not found or already deleted");
	return { success: true };
};

export const scanLibrary = async (libraryId: number) => {
	const library = await libraryRepository.findById(libraryId);
	if (!library)
		throw new NotFoundError("Library not found");

	const paths = library.paths;
	if (!paths || paths.length === 0) {
		throw new BadRequestError("This library has no paths configured");
	}

	const task = await createTask({
		type: "library-scan",
		label: `Scanning ${library.name}`,
	});

	(async () => {
		for (const pathObj of paths) {
			try {
				await scanPathLibrary(pathObj.path, library.id, pathObj.id, task.id);
			} catch (error) {
				logger.error({ err: error, path: pathObj.path }, "Error scanning library path");
			}
		}
	})();

	return { success: true, message: "Library scan started" };
};
