import type { BookMetadata } from "../book.metadata.model";

export interface IMetadataProvider {
	/**
	 * Obtiene metadata para un libro a partir de la metadata parcial proporcionada.
	 * @param input Metadata parcial (puede contener solo algunos campos).
	 * @returns Metadata parcial con los campos que este provider puede aportar.
	 */
	getMetadata(input: Partial<BookMetadata>): Promise<Partial<BookMetadata>>;
}
