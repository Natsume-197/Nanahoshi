import { describe, expect, test } from "bun:test";
import { attachmentContentDisposition } from "./content-disposition";

describe("attachmentContentDisposition", () => {
	test("preserves Unicode names through filename-star", () => {
		expect(attachmentContentDisposition("Cien años de soledad.epub")).toBe(
			"attachment; filename=\"Cien anos de soledad.epub\"; filename*=UTF-8''Cien%20a%C3%B1os%20de%20soledad.epub",
		);
	});

	test("does not allow quoted filename values to escape", () => {
		const header = attachmentContentDisposition('A "book".epub');
		expect(header).toContain('filename="A _book_.epub"');
		expect(header).toContain("filename*=UTF-8''A%20%22book%22.epub");
	});
});
