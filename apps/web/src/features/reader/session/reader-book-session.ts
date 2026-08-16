import type { LazyHtmlBook } from "@/features/reader/document/lazy-html-book";
import type { ReaderBookData } from "@/features/reader/document/types";

/**
 * Owns resources that live as long as one open reader book.
 *
 * Complete HTML books have no open handle. Range-backed EPUBs do: their lazy
 * reader keeps an ebook/ZIP source open until the route switches books or
 * unmounts. Keeping disposal alongside the data makes that lifecycle explicit
 * and prevents a loader from having to know which resource was opened.
 */
export interface ReaderBookSession {
	data: ReaderBookData;
	lazyBook?: LazyHtmlBook;
	dispose(): Promise<void>;
}

export function createReaderBookSession({
	data,
	lazyBook,
}: {
	data: ReaderBookData;
	lazyBook?: LazyHtmlBook;
}): ReaderBookSession {
	let disposed = false;

	return {
		data,
		lazyBook,
		async dispose() {
			if (disposed) return;
			disposed = true;
			await lazyBook?.close();
		},
	};
}
