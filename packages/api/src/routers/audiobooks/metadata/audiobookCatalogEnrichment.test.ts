import { beforeEach, expect, test } from "bun:test";
import { providerGate } from "../../../infrastructure/providerGate";
import { runAudiobookCatalogEnrichment } from "./audiobookCatalogEnrichment";
import type { IAudiobookMetadataProvider } from "./providers/IMetadata.provider";

beforeEach(() => providerGate.clearAllInMemory());
const base = {
	title: "Great Story",
	authors: [{ name: "Known Author" }],
	duration: 3600,
};
function provider(
	id: "audible" | "itunes",
	description: string,
): IAudiobookMetadataProvider {
	return {
		id,
		search: async () => [
			{
				...base,
				provider: id,
				providerId: id === "audible" ? "B012345678" : "123",
			},
		],
		getById: async () => ({ ...base, description }),
	};
}
test.each(["fill_gaps", "if_provided"] as const)(
	"audiobooks: %s preserves or replaces existing values",
	async (mode) => {
		const result = await runAudiobookCatalogEnrichment({
			metadata: { ...base, bookId: 1, uuid: "book-1", description: "Saved" },
			providers: [
				provider("audible", "Fallback"),
				provider("itunes", "Preferred"),
			],
			region: "us",
			downloadCovers: false,
			routing: {
				order: ["audible", "itunes"],
				fields: { description: ["itunes", "audible"] },
				updates: { description: mode },
			},
		});
		expect(result.status).toBe("matched");
		if (result.status === "matched")
			expect(result.metadata.description).toBe(
				mode === "fill_gaps" ? "Saved" : "Preferred",
			);
	},
);
test("audiobooks: later provider can win priority for an empty field", async () => {
	const result = await runAudiobookCatalogEnrichment({
		metadata: { ...base, bookId: 1, uuid: "book-1" },
		providers: [
			provider("audible", "Fallback"),
			provider("itunes", "Preferred"),
		],
		region: "us",
		downloadCovers: false,
		routing: {
			order: ["audible", "itunes"],
			fields: { description: ["itunes", "audible"] },
			updates: { description: "fill_gaps" },
		},
	});
	expect(result.status).toBe("matched");
	if (result.status === "matched")
		expect(result.metadata.description).toBe("Preferred");
});
test("audiobooks: disabled and locked fields preserve their values", async () => {
	const result = await runAudiobookCatalogEnrichment({
		metadata: { ...base, bookId: 1, uuid: "book-1", description: "Saved" },
		providers: [provider("audible", "Replacement")],
		region: "us",
		downloadCovers: false,
		routing: {
			order: ["audible"],
			fields: { description: [] },
			updates: { title: "if_provided" },
		},
		protectedFields: ["title"],
	});
	expect(result.status).toBe("matched");
	if (result.status === "matched")
		expect(result.metadata).toMatchObject({
			title: base.title,
			description: "Saved",
		});
});
