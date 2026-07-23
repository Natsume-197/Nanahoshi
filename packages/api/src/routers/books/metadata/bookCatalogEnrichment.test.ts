import { beforeEach, describe, expect, test } from "bun:test";
import { providerGate } from "../../../infrastructure/providerGate";
import type { CatalogIdentityEvidence } from "../../../modules/catalogIdentity";
import type { BookMetadata } from "./book.metadata.model";
import { runBookCatalogEnrichment } from "./bookCatalogEnrichment";
import {
	type IMetadataProvider,
	metadataProviderResult,
} from "./providers/IMetadata.provider";
import { ProviderTransientError } from "./providers/provider.utils";

const identity: CatalogIdentityEvidence = {
	kind: "book",
	title: "Great Story 1",
	creators: [{ name: "Known Author", role: "Author" }],
};

function provider(metadata: Partial<BookMetadata>): IMetadataProvider {
	return {
		getMetadata: async () => metadataProviderResult(metadata, identity),
	};
}

describe("Book Catalog Enrichment", () => {
	beforeEach(() => {
		// The shared breaker persists across tests in the bun process.
		providerGate.clearAllInMemory();
	});

	test("attributes authors to the first provider that supplies them", async () => {
		const result = await runBookCatalogEnrichment({
			metadata: {
				bookId: 1,
				uuid: "book-1",
				title: "Great Story 1",
				authors: [{ name: "Known Author", role: "Author" }],
			},
			providers: [
				{
					name: "ranobedb",
					provider: provider({ description: "First description" }),
				},
				{
					name: "amazon",
					provider: provider({
						authors: [{ name: "Known Author", role: "Author" }],
						rating: 4.5,
					}),
				},
			],
		});

		expect(result.status).toBe("matched");
		if (result.status !== "matched") return;
		expect(result.authorsProvider).toBe("amazon");
		expect(result.metadata).toMatchObject({
			description: "First description",
			authors: [{ name: "Known Author", role: "Author" }],
			rating: 4.5,
		});
	});

	test("keeps a transient provider failure attributable after a fallback match", async () => {
		const unavailable: IMetadataProvider = {
			getMetadata: async () => {
				throw new ProviderTransientError("RanobeDB is unavailable");
			},
		};
		const result = await runBookCatalogEnrichment({
			metadata: {
				bookId: 1,
				uuid: "book-1",
				title: "Great Story 1",
				authors: [{ name: "Known Author", role: "Author" }],
			},
			providers: [
				{ name: "ranobedb", provider: unavailable },
				{
					name: "amazon",
					provider: provider({ description: "Fallback description" }),
				},
			],
		});

		expect(result).toMatchObject({
			status: "matched",
			retryable: true,
			failures: [
				{
					provider: "ranobedb",
					phase: "discovery",
					kind: "transient",
					code: "provider_unavailable",
				},
			],
		});
	});

	test("a field rule excludes providers from serving that field", async () => {
		const result = await runBookCatalogEnrichment({
			metadata: {
				bookId: 1,
				uuid: "book-1",
				title: "Great Story 1",
				authors: [{ name: "Known Author", role: "Author" }],
			},
			providers: [
				{
					name: "ranobedb",
					provider: provider({
						description: "RanobeDB description",
						pageCount: 200,
					}),
				},
			],
			routing: {
				order: ["ranobedb"],
				fields: { description: ["amazon"] },
			},
		});

		expect(result.status).toBe("matched");
		if (result.status !== "matched") return;
		// pageCount flows through the chain order; description was reserved for
		// amazon, which is not in the chain, so it stays empty.
		expect(result.metadata.pageCount).toBe(200);
		expect(result.metadata.description).toBeUndefined();
	});

	test("a later provider with better field priority overrides the earlier value", async () => {
		const result = await runBookCatalogEnrichment({
			metadata: {
				bookId: 1,
				uuid: "book-1",
				title: "Great Story 1",
				authors: [{ name: "Known Author", role: "Author" }],
			},
			providers: [
				{
					name: "ranobedb",
					provider: provider({ description: "RanobeDB description" }),
				},
				{
					name: "amazon",
					provider: provider({ description: "Amazon description" }),
				},
			],
			routing: {
				order: ["ranobedb", "amazon"],
				fields: { description: ["amazon", "ranobedb"] },
			},
		});

		expect(result.status).toBe("matched");
		if (result.status !== "matched") return;
		expect(result.metadata.description).toBe("Amazon description");
		expect(result.fieldSources.description).toBe("amazon");
	});

	test("pre-existing DB values are never overridden outside refresh", async () => {
		const result = await runBookCatalogEnrichment({
			metadata: {
				bookId: 1,
				uuid: "book-1",
				title: "Great Story 1",
				description: "Existing description",
				authors: [{ name: "Known Author", role: "Author" }],
			},
			providers: [
				{
					name: "amazon",
					provider: provider({
						description: "Amazon description",
						pageCount: 300,
					}),
				},
			],
			routing: {
				order: ["amazon"],
				fields: { description: ["amazon"] },
			},
		});

		expect(result.status).toBe("matched");
		if (result.status !== "matched") return;
		expect(result.metadata.description).toBe("Existing description");
		expect(result.metadata.pageCount).toBe(300);
	});

	test("refresh never removes or replaces a protected field", async () => {
		const result = await runBookCatalogEnrichment({
			metadata: {
				bookId: 1,
				uuid: "book-1",
				title: "Great Story 1",
				description: "Manual description",
				authors: [{ name: "Known Author", role: "Author" }],
			},
			providers: [
				{
					name: "amazon",
					provider: provider({
						description: "Provider description",
						rating: 4.5,
					}),
				},
			],
			protectedFields: ["description"],
			refresh: true,
		});

		expect(result.status === "matched" ? result.metadata : null).toMatchObject({
			description: "Manual description",
			rating: 4.5,
		});
	});
});
