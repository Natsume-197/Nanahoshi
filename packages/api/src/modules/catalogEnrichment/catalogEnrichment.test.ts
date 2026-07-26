import { describe, expect, test } from "bun:test";
import type { CatalogIdentityEvidence } from "../catalogIdentity";
import {
	type CatalogEnrichmentPolicy,
	type CatalogProviderAdapter,
	CatalogProviderError,
	runCatalogEnrichment,
} from ".";

type TestMetadata = {
	title?: string | null;
	description?: string | null;
	authors?: { name: string }[] | null;
};

type TestProvider = "first" | "second";

const audiobookEvidence = (
	title: string,
	extra: Partial<CatalogIdentityEvidence> = {},
): CatalogIdentityEvidence => ({ kind: "audiobook", title, ...extra });

const policy: CatalogEnrichmentPolicy<TestMetadata> = {
	discoveryQueries: (metadata) => [audiobookEvidence(metadata.title ?? "")],
	rank: (_metadata, candidate) =>
		candidate.evidence.title === "Great Story" ? 1 : 0,
	merge: (current, incoming) => ({ ...current, ...incoming }),
};

describe("Catalog Enrichment Pipeline", () => {
	test("returns metadata from a final Confirmed provider candidate", async () => {
		const provider: CatalogProviderAdapter<TestProvider, TestMetadata> = {
			id: "first",
			discover: async () => [
				{
					providerId: "candidate-1",
					metadata: { title: "Great Story" },
					evidence: audiobookEvidence("Great Story"),
				},
			],
			hydrate: async () => ({
				metadata: {
					title: "Great Story",
					description: "Provider description",
				},
				evidence: audiobookEvidence("Great Story"),
			}),
		};

		const result = await runCatalogEnrichment({
			initialMetadata: { title: "Great Story" },
			initialEvidence: audiobookEvidence("Great Story"),
			providers: [provider],
			policy,
		});

		expect(result).toEqual({
			status: "matched",
			metadata: {
				title: "Great Story",
				description: "Provider description",
			},
			primaryProvider: "first",
			primaryProviderId: "candidate-1",
			contributingProviders: ["first"],
			matches: [
				{
					provider: "first",
					providerId: "candidate-1",
					reasons: ["group.member_confirmed", "audiobook.title_match"],
				},
			],
			primaryReasons: ["group.member_confirmed", "audiobook.title_match"],
			primaryAmbiguous: false,
			fieldSources: { description: "first" },
			failures: [],
			retryable: false,
		});
	});

	test("returns a match with the provider that failed and a pending retry", async () => {
		const unavailable: CatalogProviderAdapter<TestProvider, TestMetadata> = {
			id: "first",
			discover: async () => {
				throw new CatalogProviderError("transient", "rate_limited");
			},
			hydrate: async () => null,
		};
		const fallback: CatalogProviderAdapter<TestProvider, TestMetadata> = {
			id: "second",
			discover: async () => [
				{
					providerId: "fallback",
					metadata: { title: "Great Story" },
					evidence: audiobookEvidence("Great Story"),
				},
			],
			hydrate: async () => ({
				metadata: { description: "Fallback description" },
				evidence: audiobookEvidence("Great Story"),
			}),
		};

		const result = await runCatalogEnrichment({
			initialMetadata: { title: "Great Story" },
			initialEvidence: audiobookEvidence("Great Story"),
			providers: [unavailable, fallback],
			policy,
		});

		expect(result).toEqual({
			status: "matched",
			metadata: {
				title: "Great Story",
				description: "Fallback description",
			},
			primaryProvider: "second",
			primaryProviderId: "fallback",
			contributingProviders: ["second"],
			matches: [
				{
					provider: "second",
					providerId: "fallback",
					reasons: ["group.member_confirmed", "audiobook.title_match"],
				},
			],
			primaryReasons: ["group.member_confirmed", "audiobook.title_match"],
			primaryAmbiguous: false,
			fieldSources: { description: "second" },
			failures: [
				{
					provider: "first",
					phase: "discovery",
					kind: "transient",
					code: "rate_limited",
				},
			],
			retryable: true,
		});
	});

	test("never merges provider values into protected fields", async () => {
		const provider: CatalogProviderAdapter<TestProvider, TestMetadata> = {
			id: "first",
			discover: async () => [
				{
					providerId: "candidate-1",
					metadata: { title: "Great Story" },
					evidence: audiobookEvidence("Great Story"),
				},
			],
			hydrate: async () => ({
				metadata: {
					title: "Provider title",
					description: "Provider description",
				},
				evidence: audiobookEvidence("Great Story"),
			}),
		};

		const result = await runCatalogEnrichment({
			initialMetadata: { title: "Manual title" },
			initialEvidence: audiobookEvidence("Great Story"),
			providers: [provider],
			policy,
			protectedFields: ["title"],
		});

		expect(result.status === "matched" ? result.metadata : null).toEqual({
			title: "Manual title",
			description: "Provider description",
		});
	});

	test("lets the media policy distinguish primary and secondary contributions", async () => {
		const provider = (
			id: TestProvider,
			providerId: string,
			author: string,
		): CatalogProviderAdapter<TestProvider, TestMetadata> => ({
			id,
			discover: async () => [
				{
					providerId,
					metadata: { title: "Great Story" },
					evidence: audiobookEvidence("Great Story"),
				},
			],
			hydrate: async () => ({
				metadata: { authors: [{ name: author }] },
				evidence: audiobookEvidence("Great Story"),
			}),
		});
		const primaryAwarePolicy: CatalogEnrichmentPolicy<TestMetadata> = {
			...policy,
			merge: (current, incoming, context) => ({
				...current,
				...incoming,
				authors: context.primary ? incoming.authors : current.authors,
			}),
		};

		const result = await runCatalogEnrichment({
			initialMetadata: {
				title: "Great Story",
				authors: [{ name: "Local Author" }],
			},
			initialEvidence: audiobookEvidence("Great Story"),
			providers: [
				provider("first", "candidate-1", "Primary Author"),
				provider("second", "candidate-2", "Secondary Author"),
			],
			policy: primaryAwarePolicy,
		});

		expect(result.status === "matched" ? result : null).toEqual({
			status: "matched",
			metadata: {
				title: "Great Story",
				authors: [{ name: "Primary Author" }],
			},
			primaryProvider: "first",
			primaryProviderId: "candidate-1",
			contributingProviders: ["first", "second"],
			matches: [
				{
					provider: "first",
					providerId: "candidate-1",
					reasons: ["group.member_confirmed", "audiobook.title_match"],
				},
				{ provider: "second", providerId: "candidate-2" },
			],
			primaryReasons: ["group.member_confirmed", "audiobook.title_match"],
			primaryAmbiguous: false,
			fieldSources: { authors: "first" },
			failures: [],
			retryable: false,
		});
	});

	test("reports when a provider has more viable candidates than the hydration budget", async () => {
		const provider: CatalogProviderAdapter<TestProvider, TestMetadata> = {
			id: "first",
			discover: async () =>
				[1, 2, 3, 4].map((number) => ({
					providerId: `candidate-${number}`,
					metadata: { title: "Great Story" },
					evidence: audiobookEvidence("Great Story"),
				})),
			hydrate: async () => ({
				metadata: { title: "Wrong Story" },
				evidence: audiobookEvidence("Completely Different Book"),
			}),
		};

		const result = await runCatalogEnrichment({
			initialMetadata: { title: "Great Story" },
			initialEvidence: audiobookEvidence("Great Story"),
			providers: [provider],
			policy,
		});

		expect(result).toEqual({
			status: "no_match",
			failures: [
				{
					provider: "first",
					phase: "hydration",
					kind: "permanent",
					code: "candidate_budget_exhausted",
				},
			],
		});
	});

	test("duplicate provider ids consume a single hydration slot", async () => {
		const hydratedIds: string[] = [];
		const duplicate = {
			providerId: "duplicate",
			metadata: { title: "Great Story" },
			evidence: audiobookEvidence("Great Story"),
		};
		const provider: CatalogProviderAdapter<TestProvider, TestMetadata> = {
			id: "first",
			discover: async () => [
				duplicate,
				duplicate,
				duplicate,
				{
					providerId: "valid",
					metadata: { title: "Great Story" },
					evidence: audiobookEvidence("Great Story"),
				},
			],
			hydrate: async (candidate) => {
				hydratedIds.push(candidate.providerId);
				return candidate.providerId === "valid"
					? {
							metadata: { description: "Found after duplicate" },
							evidence: audiobookEvidence("Great Story"),
						}
					: null;
			},
		};

		const result = await runCatalogEnrichment({
			initialMetadata: { title: "Great Story" },
			initialEvidence: audiobookEvidence("Great Story"),
			providers: [provider],
			policy,
		});

		expect(hydratedIds).toEqual(["duplicate", "valid"]);
		expect(result.status).toBe("matched");
	});

	test("flags the primary match as ambiguous when a rival is equally confirmable", async () => {
		const provider: CatalogProviderAdapter<TestProvider, TestMetadata> = {
			id: "first",
			discover: async () =>
				["candidate-1", "candidate-2"].map((providerId) => ({
					providerId,
					metadata: { title: "Great Story" },
					evidence: audiobookEvidence("Great Story"),
				})),
			hydrate: async () => ({
				metadata: { description: "Provider description" },
				evidence: audiobookEvidence("Great Story"),
			}),
		};

		const result = await runCatalogEnrichment({
			initialMetadata: { title: "Great Story" },
			initialEvidence: audiobookEvidence("Great Story"),
			providers: [provider],
			policy,
		});

		expect(result.status === "matched" && result.primaryAmbiguous).toBe(true);
	});

	test("a rival the gate rejects does not make the match ambiguous", async () => {
		const provider: CatalogProviderAdapter<TestProvider, TestMetadata> = {
			id: "first",
			discover: async () => [
				{
					providerId: "candidate-1",
					metadata: { title: "Great Story" },
					evidence: audiobookEvidence("Great Story"),
				},
				{
					providerId: "unrelated",
					metadata: { title: "Something Else Entirely" },
					evidence: audiobookEvidence("Something Else Entirely"),
				},
			],
			hydrate: async () => ({
				metadata: { description: "Provider description" },
				evidence: audiobookEvidence("Great Story"),
			}),
		};

		const result = await runCatalogEnrichment({
			initialMetadata: { title: "Great Story" },
			initialEvidence: audiobookEvidence("Great Story"),
			providers: [provider],
			policy,
		});

		expect(result.status === "matched" && result.primaryAmbiguous).toBe(false);
	});
});

describe("what the automatic match picked", () => {
	const describingPolicy = {
		...policy,
		describe: (metadata: Partial<TestMetadata>) => metadata.title,
	};

	const providerReturning = (
		id: TestProvider,
		providerId: string,
		hydratedTitle: string,
	): CatalogProviderAdapter<TestProvider, TestMetadata> => ({
		id,
		discover: async () => [
			{
				providerId,
				metadata: { title: "Ochibore" },
				evidence: audiobookEvidence("Ochibore"),
			},
		],
		hydrate: async () => ({
			metadata: { title: hydratedTitle, description: `via ${id}` },
			evidence: audiobookEvidence("Ochibore"),
		}),
	});

	// Recorded from the hydrated candidate, so a later provider or a manual edit
	// overwriting the book's own title cannot rewrite history.
	test("records the candidate as the provider described it", async () => {
		const result = await runCatalogEnrichment({
			initialMetadata: { title: "Ochibore" },
			initialEvidence: audiobookEvidence("Ochibore"),
			providers: [providerReturning("first", "rndb-42", "Ochibore vol. 3")],
			policy: describingPolicy,
		});

		expect(result.status).toBe("matched");
		if (result.status !== "matched") return;
		expect(result.matches[0]).toEqual({
			provider: "first",
			providerId: "rndb-42",
			title: "Ochibore vol. 3",
			reasons: ["group.member_confirmed", "audiobook.title_match"],
		});
	});

	test("only the primary match carries the identity reasons", async () => {
		const result = await runCatalogEnrichment({
			initialMetadata: { title: "Ochibore" },
			initialEvidence: audiobookEvidence("Ochibore"),
			providers: [
				providerReturning("first", "rndb-42", "Ochibore vol. 3"),
				providerReturning("second", "asin-7", "Ochibore 3"),
			],
			policy: describingPolicy,
		});

		expect(result.status).toBe("matched");
		if (result.status !== "matched") return;
		expect(result.matches[0]?.reasons).toBeDefined();
		expect(result.matches[1]?.reasons).toBeUndefined();
		expect(result.matches[1]?.title).toBe("Ochibore 3");
	});

	test("a policy without describe records no title", async () => {
		const result = await runCatalogEnrichment({
			initialMetadata: { title: "Ochibore" },
			initialEvidence: audiobookEvidence("Ochibore"),
			providers: [providerReturning("first", "rndb-42", "Ochibore vol. 3")],
			policy,
		});

		expect(result.status).toBe("matched");
		if (result.status !== "matched") return;
		expect(result.matches[0]?.title).toBeUndefined();
	});
});
