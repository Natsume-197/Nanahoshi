import "@/test-utils/setup-dom";
import { expect, mock, test } from "bun:test";
import type { EbookDocument } from "@nanahoshi-v2/ebook-parser";
import { adaptPagedEbook } from "./paged-ebook.adapter";

test("abandoning a comic stops unpacking subsequent pages and closes its owned archive", async () => {
	const controller = new AbortController();
	const openPage = mock(async () => {
		controller.abort();
		return { data: new Uint8Array([1]), mediaType: "image/png" };
	});
	const close = mock(async () => {});
	const ebook = {
		format: "cbz",
		content: { kind: "pages", pages: [{ id: "one" }, { id: "two" }], openPage },
		close,
	} as unknown as EbookDocument;
	await expect(
		adaptPagedEbook(ebook, "book", "Book", document, controller.signal),
	).rejects.toHaveProperty("name", "AbortError");
	expect(openPage).toHaveBeenCalledTimes(1);
	expect(close).toHaveBeenCalledTimes(1);
});
