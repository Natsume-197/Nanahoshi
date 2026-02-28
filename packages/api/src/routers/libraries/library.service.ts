import { ORPCError } from "@orpc/server";
import { scanPathLibrary } from "../../modules/libraryScanner";
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
		throw new ORPCError("NOT_FOUND", { message: "Library not found" });
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
		throw new ORPCError("NOT_FOUND", {
			message: "Path not found or already deleted",
		});
	return { success: true };
};

export const updateLibrary = async (
	id: number,
	data: { name?: string; isCronWatch?: boolean; isPublic?: boolean },
) => {
	const updated = await libraryRepository.update(id, data);
	if (!updated)
		throw new ORPCError("NOT_FOUND", { message: "Library not found" });
	return updated;
};

export const deleteLibrary = async (id: number) => {
	const deleted = await libraryRepository.delete(id);
	if (!deleted)
		throw new ORPCError("NOT_FOUND", {
			message: "Library not found or already deleted",
		});
	return { success: true };
};

export const scanLibrary = async (libraryId: number) => {
	const library = await libraryRepository.findById(libraryId);
	if (!library)
		throw new ORPCError("NOT_FOUND", { message: "Library not found" });

	if (!library.paths || library.paths.length === 0) {
		throw new ORPCError("BAD_REQUEST", {
			message: "This library has no paths configured",
		});
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
