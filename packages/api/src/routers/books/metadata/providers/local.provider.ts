import path from "node:path";
import { logger } from "../../../../lib/logger";
import { LibraryRepository } from "../../../libraries/library.repository";
import { bookRepository } from "../../book.repository";
import type { Author, BookMetadata, Publisher } from "../book.metadata.model";
import { readLocalEbook } from "./local-ebook";

const log = logger.child({ component: "local-provider" });

export class LocalProvider {
	private libraryRepository = new LibraryRepository();

	async getMetadata(
		input: Partial<BookMetadata> & {
			bookId?: number;
			uuid: string;
			filePath?: string;
		},
	): Promise<Partial<BookMetadata>> {
		if (!input.bookId) return {};

		const filePath =
			input.filePath ?? (await this.getBookFilePath(input.bookId));
		if (!filePath) {
			log.error(
				{ bookId: input.bookId },
				"No se encontró el archivo para bookId",
			);
			return {};
		}

		try {
			const ebook = await readLocalEbook(filePath, input.uuid);
			const authors: Author[] = ebook.authors.map((name) => ({
				name,
				role: null,
			}));
			const publisher: Publisher | undefined = ebook.publisher
				? { name: ebook.publisher }
				: undefined;

			return {
				title: ebook.title || undefined,
				subtitle: ebook.subtitle || undefined,
				description: ebook.description || undefined,
				authors,
				publishedDate: ebook.publishedDate,
				languageCode: ebook.language || undefined,
				pageCount: null,
				isbn10: ebook.isbn10,
				isbn13: ebook.isbn13,
				asin: ebook.asin,
				embeddedUid: ebook.embeddedUid,
				cover: ebook.cover || undefined,
				amountChars: null,
				contentForm: ebook.contentForm,
				publisher,
			};
		} catch (error) {
			log.warn(
				{ err: error, bookId: input.bookId },
				"No se pudo extraer metadata del ebook",
			);
			return {};
		}
	}

	private async getBookFilePath(bookId: number): Promise<string | null> {
		const book = await bookRepository.getById(bookId);
		if (!book?.relativePath || !book.libraryPathId || !book.libraryId) {
			return null;
		}

		const paths = await this.libraryRepository.findPathsByLibraryId(
			book.libraryId,
		);
		const libraryPath = paths?.find(
			(candidate) => candidate.id === book.libraryPathId,
		);
		if (!libraryPath) return null;

		return path.join(libraryPath.path, path.normalize(book.relativePath));
	}
}

export const localProvider = new LocalProvider();
