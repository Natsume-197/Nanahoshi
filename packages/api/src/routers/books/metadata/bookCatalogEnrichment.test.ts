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
		discoverCandidates: async () => [
			{ providerId: "candidate-1", identity, metadata },
		],
		hydrateCandidate: async (candidate) =>
			metadataProviderResult(candidate.metadata ?? {}, identity),
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
			discoverCandidates: async () => {
				throw new ProviderTransientError("RanobeDB is unavailable");
			},
			hydrateCandidate: async () => null,
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

	test("does not let a supplemental provider replace an unavailable authority", async () => {
		const unavailable: IMetadataProvider = {
			discoverCandidates: async () => {
				throw new ProviderTransientError("RanobeDB is unavailable");
			},
			hydrateCandidate: async () => null,
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
					name: "googlebooks",
					provider: provider({ description: "Lower-quality fallback" }),
				},
			],
			routing: {
				primary: "ranobedb",
				order: ["ranobedb", "googlebooks"],
			},
		});

		expect(result).toMatchObject({
			status: "retryable_failure",
			failures: [
				{
					provider: "ranobedb",
					code: "provider_unavailable",
				},
			],
		});
	});

	test("supplemental providers may fill allowed gaps after authority confirms", async () => {
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
						description: "Authoritative description",
						series: { name: "Great Story" },
					}),
				},
				{
					name: "googlebooks",
					provider: provider({
						description: "Translated description",
						cover: "https://example.com/cover.jpg",
					}),
				},
			],
			routing: {
				primary: "ranobedb",
				order: ["ranobedb", "googlebooks"],
				fields: {
					description: ["ranobedb"],
					series: ["ranobedb"],
					cover: ["googlebooks"],
				},
			},
		});

		expect(result.status).toBe("matched");
		if (result.status !== "matched") return;
		expect(result.primaryProvider).toBe("ranobedb");
		expect(result.metadata).toMatchObject({
			description: "Authoritative description",
			series: { name: "Great Story" },
			cover: "https://example.com/cover.jpg",
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
				authors: [{ name: "Known Author", role: "Author" }],
				description: "Existing description",
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
				authors: [{ name: "Known Author", role: "Author" }],
				description: "Manual description",
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

	describe("providers that expose their candidate list", () => {
		const input = {
			bookId: 1,
			uuid: "book-1",
			title: "Great Story 1",
			authors: [{ name: "Known Author", role: "Author" }],
		};

		// A provider that hands the pipeline its ranked candidates instead of a
		// single pick it already made.
		function splitProvider(
			candidates: {
				providerId: string;
				identity: CatalogIdentityEvidence;
				metadata: Partial<BookMetadata>;
			}[],
			hydrated: string[] = [],
		): IMetadataProvider {
			return {
				discoverCandidates: async () =>
					candidates.map(({ providerId, identity: candidateIdentity }) => ({
						providerId,
						identity: candidateIdentity,
					})),
				hydrateCandidate: async (candidate) => {
					hydrated.push(candidate.providerId);
					const found = candidates.find(
						(entry) => entry.providerId === candidate.providerId,
					);
					return found
						? metadataProviderResult(found.metadata, found.identity)
						: null;
				},
			};
		}

		test("falls through to the runner-up when the gate rejects the top pick", async () => {
			const hydrated: string[] = [];
			const result = await runBookCatalogEnrichment({
				metadata: input,
				providers: [
					{
						name: "ranobedb",
						provider: splitProvider(
							[
								{
									providerId: "wrong-volume",
									// Volume 2 against an input on volume 1: a hard reject.
									identity: {
										kind: "book",
										title: "Great Story 2",
										creators: [{ name: "Known Author", role: "Author" }],
									},
									metadata: { description: "Wrong volume" },
								},
								{
									providerId: "right-volume",
									identity,
									metadata: { description: "Right volume" },
								},
							],
							hydrated,
						),
					},
				],
			});

			expect(result.status).toBe("matched");
			if (result.status !== "matched") return;
			expect(result.metadata.description).toBe("Right volume");
			expect(result.primaryProviderId).toBe("right-volume");
			// The rejected rival is discarded on search evidence, never fetched.
			expect(hydrated).toEqual(["right-volume"]);
		});

		test("reports a tie between two equally confirmable candidates", async () => {
			const result = await runBookCatalogEnrichment({
				metadata: input,
				providers: [
					{
						name: "ranobedb",
						provider: splitProvider([
							{
								providerId: "edition-a",
								identity,
								metadata: { description: "Edition A" },
							},
							{
								providerId: "edition-b",
								identity,
								metadata: { description: "Edition B" },
							},
						]),
					},
				],
			});

			expect(result.status === "matched" && result.primaryAmbiguous).toBe(true);
		});

		test("a single candidate is not a tie", async () => {
			const result = await runBookCatalogEnrichment({
				metadata: input,
				providers: [
					{
						name: "ranobedb",
						provider: splitProvider([
							{
								providerId: "only",
								identity,
								metadata: { description: "Only" },
							},
						]),
					},
				],
			});

			expect(result.status === "matched" && result.primaryAmbiguous).toBe(
				false,
			);
		});

		test("vetoes a candidate by a different author instead of merging it", async () => {
			const hydrated: string[] = [];
			const result = await runBookCatalogEnrichment({
				metadata: input,
				providers: [
					{
						name: "hardcover",
						provider: splitProvider(
							[
								{
									providerId: "wrong-author",
									identity: {
										kind: "book",
										title: "Great Story 1",
										authors: ["Somebody Else"],
									},
									metadata: { description: "Wrong author" },
								},
								{
									providerId: "right-author",
									identity,
									metadata: { description: "Right author" },
								},
							],
							hydrated,
						),
					},
				],
			});

			expect(result.status).toBe("matched");
			if (result.status !== "matched") return;
			expect(result.metadata.description).toBe("Right author");
			expect(hydrated).toEqual(["right-author"]);
		});

		test("skips a candidate that turns out not to be a book", async () => {
			// Hydration returning null (an Amazon series landing page, a dead id)
			// means "try the next one", not "no match".
			const result = await runBookCatalogEnrichment({
				metadata: input,
				providers: [
					{
						name: "amazon",
						provider: {
							discoverCandidates: async () => [
								{ providerId: "landing-page", identity },
								{ providerId: "real-book", identity },
							],
							hydrateCandidate: async (candidate) =>
								candidate.providerId === "real-book"
									? metadataProviderResult(
											{ description: "Real book" },
											identity,
										)
									: null,
						},
					},
				],
			});

			expect(result.status).toBe("matched");
			if (result.status !== "matched") return;
			expect(result.primaryProviderId).toBe("real-book");
		});

		test("a broken provider contributes nothing and the chain moves on", async () => {
			const result = await runBookCatalogEnrichment({
				metadata: input,
				providers: [
					{
						name: "ranobedb",
						provider: {
							discoverCandidates: async () => {
								throw new TypeError("unexpected payload");
							},
							hydrateCandidate: async () => null,
						},
					},
					{
						name: "amazon",
						provider: splitProvider([
							{
								providerId: "fallback",
								identity,
								metadata: { description: "From the next provider" },
							},
						]),
					},
				],
			});

			expect(result.status).toBe("matched");
			if (result.status !== "matched") return;
			expect(result.metadata.description).toBe("From the next provider");
		});

		test("a transient failure while hydrating trips the shared breaker", async () => {
			const result = await runBookCatalogEnrichment({
				metadata: input,
				providers: [
					{
						name: "ranobedb",
						provider: {
							getMetadata: async () => {
								throw new Error("legacy path must not run");
							},
							discoverCandidates: async () => [
								{ providerId: "candidate-1", identity },
							],
							hydrateCandidate: async () => {
								throw new ProviderTransientError("rate limited");
							},
						},
					},
				],
			});

			expect(result.status).toBe("retryable_failure");
			expect(await providerGate.cooldownRemainingMs("ranobedb")).not.toBeNull();
		});
	});

	// A manga adaptation carries the novel's title and its original author, so
	// the identity gate confirms it against the novel's record. Nothing in that
	// comparison can separate them — only the form of the book can.
	describe("providers that do not catalog the book's content form", () => {
		const novelRecord = {
			titleRomaji: "Great Story 1",
			description: "A novel",
		};

		test("a page-image book never reaches a text-only catalogue", async () => {
			const result = await runBookCatalogEnrichment({
				metadata: {
					bookId: 1,
					uuid: "book-1",
					title: "Great Story 1",
					authors: [{ name: "Known Author", role: "Author" }],
					contentForm: "images",
				},
				providers: [{ name: "ranobedb", provider: provider(novelRecord) }],
			});

			expect(result.status).toBe("no_match");
		});

		test("the same book still reaches a provider that takes any form", async () => {
			const result = await runBookCatalogEnrichment({
				metadata: {
					bookId: 1,
					uuid: "book-1",
					title: "Great Story 1",
					authors: [{ name: "Known Author", role: "Author" }],
					contentForm: "images",
				},
				providers: [
					{ name: "ranobedb", provider: provider(novelRecord) },
					{ name: "amazon", provider: provider({ rating: 4.5 }) },
				],
			});

			expect(result.status).toBe("matched");
			if (result.status !== "matched") return;
			expect(result.primaryProvider).toBe("amazon");
			expect(result.metadata.titleRomaji).toBeUndefined();
		});

		test("a text book is unaffected", async () => {
			const result = await runBookCatalogEnrichment({
				metadata: {
					bookId: 1,
					uuid: "book-1",
					title: "Great Story 1",
					authors: [{ name: "Known Author", role: "Author" }],
					contentForm: "text",
				},
				providers: [{ name: "ranobedb", provider: provider(novelRecord) }],
			});

			expect(result.status).toBe("matched");
		});

		// Rows written before the form was recorded, and any book whose file
		// could not be measured, must keep reaching every provider.
		test("an unrecorded form reaches every provider", async () => {
			const result = await runBookCatalogEnrichment({
				metadata: {
					bookId: 1,
					uuid: "book-1",
					title: "Great Story 1",
					authors: [{ name: "Known Author", role: "Author" }],
				},
				providers: [{ name: "ranobedb", provider: provider(novelRecord) }],
			});

			expect(result.status).toBe("matched");
		});

		// A refresh pass re-consults providers for fields they own; it must not
		// re-open a catalogue that does not carry this kind of book at all.
		test("a refresh does not reopen an uncovered catalogue", async () => {
			const result = await runBookCatalogEnrichment({
				metadata: {
					bookId: 1,
					uuid: "book-1",
					title: "Great Story 1",
					authors: [{ name: "Known Author", role: "Author" }],
					contentForm: "images",
				},
				providers: [{ name: "ranobedb", provider: provider(novelRecord) }],
				refresh: true,
			});

			expect(result.status).toBe("no_match");
		});
	});
});
