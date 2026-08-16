import { describe, expect, mock, test } from "bun:test";
import type { ReaderBookData } from "@/features/reader/document/types";
import { createReaderBookSession } from "./reader-book-session";

const data = { uuid: "book" } as ReaderBookData;

describe("reader book session", () => {
	test("closes its lazy resource exactly once", async () => {
		const close = mock(async () => {});
		const session = createReaderBookSession({
			data,
			lazyBook: { close } as never,
		});

		await Promise.all([session.dispose(), session.dispose()]);

		expect(close).toHaveBeenCalledTimes(1);
	});

	test("has a no-op lifecycle for complete books", async () => {
		const session = createReaderBookSession({ data });

		await session.dispose();

		expect(session.data).toBe(data);
	});
});
