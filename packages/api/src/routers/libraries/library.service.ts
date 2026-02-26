import { scanPathLibrary } from "../../modules/libraryScanner";
import type { CreateLibraryInput } from "./library.model";
import { LibraryRepository } from "./library.repository";

const libraryRepository = new LibraryRepository();

export const createLibrary = async (
	input: CreateLibraryInput & { paths?: string[] },
	organizationId: string,
) => {
	return await libraryRepository.create(input, organizationId);
};

export const getLibraries = async () => {
	return await libraryRepository.findAll();
};

export const getLibraryById = async (id: number) => {
	const library = await libraryRepository.findById(id);
	if (!library) throw new Error("Library not found");
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
	if (!deleted) throw new Error("Path not found or already deleted");
	return { success: true };
};

export const scanLibrary = async (libraryId: number) => {
	const library = await libraryRepository.findById(libraryId);
	if (!library) throw new Error("Library not found");

	if (!library.paths || library.paths.length === 0) {
		throw new Error("This library has no paths configured");
	}

	(async () => {
		for (const pathObj of library.paths) {
			try {
				await scanPathLibrary(pathObj.path, library.id, pathObj.id);
			} catch (error) {
				console.error(`Error scanning path ${pathObj.path}:`, error);
			}
		}
	})();

	return { success: true, message: "Library scan started" };
};
