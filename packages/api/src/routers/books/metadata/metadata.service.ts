import { coverColorQueue } from "../../../infrastructure/queue/queues/cover-color.queue";
import type { Author, BookMetadata } from "./book.metadata.model";
import { bookMetadataRepository } from "./metadata.repository";
import type { IMetadataProvider } from "./providers/IMetadata.provider";
import { localProvider } from "./providers/local.provider";

export class BookMetadataService {
	private providers: IMetadataProvider[] = [localProvider];

	/**
	 * Enrich and save metadata using all providers.
	 */
	async enrichAndSaveMetadata(
		input: Partial<BookMetadata> & { bookId: bigint; uuid: string },
	) {
		const metadata = await this.getCompleteMetadata(input);
		if (Object.keys(metadata).length === 0) return null;

		// ── 1. Publisher ────────────────────────────────────────────
		let publisherId: number | undefined;
		if (metadata.publisher) {
			publisherId = await bookMetadataRepository.upsertPublisher(
				metadata.publisher,
			);
		}

		// ── 2. Prepare base payload (without loose strings) ─────────
		const toSave: Record<string, unknown> = { ...metadata, publisherId };
		delete (toSave as any).publisher;
		delete (toSave as any).authors;

		let saved = null;
		if (Object.keys(toSave).length) {
			saved = await bookMetadataRepository.upsertMetadata(input.bookId, toSave);
		}

		// ── 3. Authors ──────────────────────────────────────────────
		if (metadata.authors && metadata.authors.length > 0) {
			await Promise.all(
				metadata.authors.map(async (author: Author) => {
					const authorId = await bookMetadataRepository.upsertAuthor(
						author.name,
						"LOCAL",
					);
					await bookMetadataRepository.linkBookAuthor(input.bookId, authorId);
				}),
			);
		}

		// ── 4. Enqueue cover color extraction (non-blocking) ────────
		if (metadata.cover) {
			await coverColorQueue.add(
				"extract",
				{
					bookId: Number(input.bookId),
					coverPath: metadata.cover,
				},
				{ removeOnComplete: true, removeOnFail: 100 },
			);
		}

		return saved;
	}

	/**
	 * Fill in fields using all providers.
	 */
	private async getCompleteMetadata(
		input: Partial<BookMetadata>,
	): Promise<Partial<BookMetadata>> {
		let combined: Partial<BookMetadata> = { ...input };
		for (const provider of this.providers) {
			const result = await provider.getMetadata(combined);
			combined = this.mergeMetadata(combined, result);
		}
		return combined;
	}

	/**
	 * Merge metadata, giving priority to existing values.
	 */
	private mergeMetadata<T>(base: Partial<T>, extra: Partial<T>): Partial<T> {
		const result = { ...base };
		for (const key of Object.keys(extra) as (keyof T)[]) {
			if (
				result[key] === undefined ||
				result[key] === null ||
				result[key] === ""
			) {
				result[key] = extra[key];
			}
		}
		return result;
	}
}

export const bookMetadataService = new BookMetadataService();
