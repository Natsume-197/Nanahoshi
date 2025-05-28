import { StatusCodes } from "http-status-codes";

import type { Library, LibraryWithPaths } from "@/common/models/supabaseTableTypes";
import { LibraryRepository } from "@/api/library/libraryRepository";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { logger } from "@/server";
import { CreateLibraryInput } from "./libraryModel";

export class LibraryService {
	private libraryRepository: LibraryRepository;

	constructor(repository: LibraryRepository = new LibraryRepository()) {
		this.libraryRepository = repository;
	}

	// Retrieves all libraries from the database
	async findAll(): Promise<ServiceResponse<Library[] | null>> {
		try {
			const libraries = await this.libraryRepository.findAll();
			if (!libraries || libraries.length === 0) {
				return ServiceResponse.failure("No Libraries found", null, StatusCodes.NOT_FOUND);
			}
			return ServiceResponse.success<Library[]>("Libraries found", libraries);
		} catch (ex) {
			const errorMessage = `Error finding all libraries: $${(ex as Error).message}`;
			logger.error(errorMessage);
			return ServiceResponse.failure(
				"An error occurred while retrieving libraries.",
				null,
				StatusCodes.INTERNAL_SERVER_ERROR,
			);
		}
	}

	// Retrieves a single library by their ID
	async findById(id: number): Promise<ServiceResponse<Library | null>> {
		try {
			const library = await this.libraryRepository.findById(id);
			if (!library) {
				return ServiceResponse.failure("Library not found", null, StatusCodes.NOT_FOUND);
			}
			return ServiceResponse.success<Library>("Library found", library);
		} catch (ex) {
			const errorMessage = `Error finding library with id ${id}:, ${(ex as Error).message}`;
			logger.error(errorMessage);
			return ServiceResponse.failure("An error occurred while finding library.", null, StatusCodes.INTERNAL_SERVER_ERROR);
		}
	}

    // Create a single library (optional: related paths)
    async create(library: CreateLibraryInput): Promise<ServiceResponse<LibraryWithPaths | null>> {
        try {
            const createdLibrary = await this.libraryRepository.insertLibrary(library);
            return ServiceResponse.success<LibraryWithPaths>(
                "Library created successfully",
                createdLibrary,
                StatusCodes.CREATED
            );
        } catch (ex) {
            const errorMessage = `Error creating library: ${(ex as Error).message}`;
            logger.error(errorMessage);
            return ServiceResponse.failure(
                "An error occurred while creating library.",
                null,
                StatusCodes.INTERNAL_SERVER_ERROR
            );
        }
    }

}

export const libraryService = new LibraryService();
