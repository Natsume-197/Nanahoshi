import { BookRepository, bookRepository } from "./bookRepository";
import type { Book } from "./bookModel";
import { ServiceResponse } from "@/common/models/serviceResponse";
import { StatusCodes } from "http-status-codes";
import { CreateBookInput } from "./bookModel";

export class BookService {
    constructor(private readonly bookRepo: BookRepository = bookRepository) { }

    async findById(id: number) {
        try {
            const book = await this.bookRepo.findById(id);
            if (!book) return ServiceResponse.failure("Book not found", null, StatusCodes.NOT_FOUND);
            return ServiceResponse.success("Book found", book);
        } catch (ex) {
            return ServiceResponse.failure("Error finding book", null, StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

    async findByLibrary(libraryId: number) {
        try {
            const books = await this.bookRepo.findByLibraryIdAsync(libraryId);
            return ServiceResponse.success("Books found", books);
        } catch (ex) {
            return ServiceResponse.failure("Error finding books", null, StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

    async create(book: CreateBookInput) {
        try {
            const created = await this.bookRepo.insertBook(book);
            return ServiceResponse.success("Book created", created, StatusCodes.CREATED);
        } catch (ex) {
            return ServiceResponse.failure("Error creating book", null, StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

    async deleteById(id: number) {
        try {
            await this.bookRepo.deleteBook(id);
            return ServiceResponse.success("Book deleted", { success: true });
        } catch (ex) {
            return ServiceResponse.failure("Error deleting book", null, StatusCodes.INTERNAL_SERVER_ERROR);
        }
    }

}

export const bookService = new BookService();