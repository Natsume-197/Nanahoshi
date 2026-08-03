import { describe, expect, test } from "bun:test";
import { bookMetadataProfile } from "../metadataProfiles";
import {
	normalizeProviderPolicy,
	providerAllowedForField,
	providerFieldRank,
} from "../providerPolicy";

type P = "a" | "b" | "c";
const isP = (v: string): v is P => ["a", "b", "c"].includes(v);
const DEFAULT: readonly P[] = ["a", "b", "c"];

describe("normalizeProviderPolicy", () => {
	test("legacy array becomes the order", () => {
		expect(normalizeProviderPolicy(["b", "a"], isP, DEFAULT)).toEqual({
			order: ["b", "a"],
			fields: undefined,
		});
	});

	test("routed shape keeps field rules and drops unknown providers", () => {
		expect(
			normalizeProviderPolicy(
				{ order: ["a", "zzz", "b"], fields: { title: ["b", "zzz"] } },
				isP,
				DEFAULT,
			),
		).toEqual({ order: ["a", "b"], fields: { title: ["b"] } });
	});

	test("null, empty and garbage fall back to the default order", () => {
		expect(normalizeProviderPolicy(null, isP, DEFAULT).order).toEqual(DEFAULT);
		expect(normalizeProviderPolicy([], isP, DEFAULT).order).toEqual(DEFAULT);
		expect(normalizeProviderPolicy(["zzz"], isP, DEFAULT).order).toEqual(
			DEFAULT,
		);
		expect(normalizeProviderPolicy({ order: [] }, isP, DEFAULT).order).toEqual(
			DEFAULT,
		);
	});

	test("keeps a valid profile authority and rejects an authority outside the chain", () => {
		expect(
			normalizeProviderPolicy(
				{
					profile: { id: "light_novels", version: 1 },
					primary: "b",
					order: ["b", "a"],
				},
				isP,
				DEFAULT,
			),
		).toMatchObject({
			profile: { id: "light_novels", version: 1 },
			primary: "b",
			order: ["b", "a"],
		});
		expect(
			normalizeProviderPolicy({ primary: "c", order: ["a", "b"] }, isP, DEFAULT)
				.primary,
		).toBeUndefined();
	});
});

describe("bookMetadataProfile", () => {
	test("general uses Google Books as the catalog authority", () => {
		const profile = bookMetadataProfile("general");
		expect(profile.primary).toBe("googlebooks");
		expect(profile.order[0]).toBe("googlebooks");
		expect(profile.fields?.description).toEqual(["googlebooks"]);
		expect(profile.fields?.cover).toEqual([
			"googlebooks",
			"amazon",
			"openlibrary",
			"hardcover",
		]);
	});

	test("light novels protects linguistic and series metadata", () => {
		const profile = bookMetadataProfile("light_novels");
		expect(profile.primary).toBe("ranobedb");
		expect(profile.fields).toMatchObject({
			description: ["ranobedb"],
			series: ["ranobedb"],
			cover: ["googlebooks", "amazon"],
		});
	});
});

describe("providerFieldRank", () => {
	const policy = {
		order: ["a", "b", "c"] as const,
		fields: { title: ["c", "a"] as const },
	};

	test("field rule defines its own priority and allowed set", () => {
		expect(providerFieldRank(policy, "title", "c")).toBe(0);
		expect(providerFieldRank(policy, "title", "a")).toBe(1);
		expect(providerFieldRank(policy, "title", "b")).toBe(
			Number.POSITIVE_INFINITY,
		);
		expect(providerAllowedForField(policy, "title", "b")).toBe(false);
	});

	test("fields without a rule fall back to chain order", () => {
		expect(providerFieldRank(policy, "description", "a")).toBe(0);
		expect(providerFieldRank(policy, "description", "c")).toBe(2);
		expect(providerAllowedForField(policy, "description", "c")).toBe(true);
	});
});
