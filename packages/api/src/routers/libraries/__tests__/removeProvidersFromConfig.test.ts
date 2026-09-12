import { describe, expect, test } from "bun:test";
import { removeProvidersFromConfig } from "../library.model";

const DEFAULT = ["ranobedb", "googlebooks", "amazon"] as const;

describe("removeProvidersFromConfig", () => {
	test("removes a provider from the legacy array shape", () => {
		const result = removeProvidersFromConfig(
			["ranobedb", "googlebooks", "amazon"],
			["googlebooks"],
			DEFAULT,
		);
		expect(result).not.toBeNull();
		expect(result?.changed).toBe(true);
		expect(result?.config).toEqual(["ranobedb", "amazon"]);
	});

	test("removes from order, fields overrides and primary in the routed shape", () => {
		const result = removeProvidersFromConfig(
			{
				order: ["ranobedb", "googlebooks", "amazon"],
				fields: {
					description: ["googlebooks", "ranobedb"],
					cover: ["amazon"],
				},
				primary: "googlebooks",
			},
			["googlebooks"],
			DEFAULT,
		);
		expect(result?.changed).toBe(true);
		expect(result?.config).toEqual({
			order: ["ranobedb", "amazon"],
			fields: { description: ["ranobedb"], cover: ["amazon"] },
			// primary was googlebooks → dropped, not carried over
		});
	});

	test("keeps an exhausted field override disabled", () => {
		const result = removeProvidersFromConfig(
			{
				order: ["ranobedb", "googlebooks"],
				fields: { cover: ["googlebooks"] },
			},
			["googlebooks"],
			DEFAULT,
		);
		expect(result?.config).toEqual({
			order: ["ranobedb"],
			fields: { cover: [] },
		});
	});

	test("refuses to remove the only remaining provider", () => {
		expect(
			removeProvidersFromConfig(["googlebooks"], ["googlebooks"], DEFAULT),
		).toBeNull();
		expect(
			removeProvidersFromConfig(
				{ order: ["googlebooks"] },
				["googlebooks"],
				DEFAULT,
			),
		).toBeNull();
	});

	test("falls back to the default order when config is empty, then subtracts", () => {
		const result = removeProvidersFromConfig(null, ["googlebooks"], DEFAULT);
		expect(result?.changed).toBe(true);
		expect(result?.config).toEqual(["ranobedb", "amazon"]);
	});

	test("is idempotent: removing an absent provider reports no change", () => {
		const result = removeProvidersFromConfig(
			["ranobedb", "amazon"],
			["googlebooks"],
			DEFAULT,
		);
		expect(result?.changed).toBe(false);
		expect(result?.config).toEqual(["ranobedb", "amazon"]);
	});

	test("preserves an unrelated primary and profile", () => {
		const result = removeProvidersFromConfig(
			{
				order: ["ranobedb", "googlebooks", "amazon"],
				primary: "ranobedb",
				profile: { id: "light_novels", version: 2 },
			},
			["googlebooks"],
			DEFAULT,
		);
		expect(result?.config).toEqual({
			order: ["ranobedb", "amazon"],
			primary: "ranobedb",
			profile: { id: "light_novels", version: 2 },
		});
	});
});

describe("removeProvidersFromConfig (multiple)", () => {
	test("removes several providers in one pass", () => {
		const result = removeProvidersFromConfig(
			["ranobedb", "googlebooks", "openlibrary", "goodreads", "amazon"],
			["googlebooks", "openlibrary", "goodreads"],
			DEFAULT,
		);
		expect(result?.changed).toBe(true);
		expect(result?.config).toEqual(["ranobedb", "amazon"]);
	});

	test("refuses when the removals would empty the provider set", () => {
		expect(
			removeProvidersFromConfig(
				["googlebooks", "goodreads"],
				["googlebooks", "goodreads"],
				DEFAULT,
			),
		).toBeNull();
	});

	test("reports no change when none of the providers were enabled", () => {
		const result = removeProvidersFromConfig(
			["ranobedb", "amazon"],
			["googlebooks", "openlibrary"],
			DEFAULT,
		);
		expect(result?.changed).toBe(false);
		expect(result?.config).toEqual(["ranobedb", "amazon"]);
	});

	test("empty removal list is a normalizing no-op", () => {
		const result = removeProvidersFromConfig(
			["ranobedb", "amazon"],
			[],
			DEFAULT,
		);
		expect(result?.changed).toBe(false);
		expect(result?.config).toEqual(["ranobedb", "amazon"]);
	});
});

test("paused field priorities survive validation and provider removal", async () => {
	const { MetadataProvidersSchema } = await import("../library.model");
	const stored = {
		order: ["googlebooks", "amazon", "ranobedb"],
		fields: { description: [] },
		pausedFields: { description: ["amazon", "googlebooks"] },
		updates: { description: "if_provided" as const },
	};
	expect(MetadataProvidersSchema.parse(stored)).toEqual(stored);
	const result = removeProvidersFromConfig(stored, ["googlebooks"], DEFAULT);
	expect(result?.config).toMatchObject({
		fields: { description: [] },
		pausedFields: { description: ["amazon"] },
		updates: { description: "if_provided" },
	});
	expect(result?.changed).toBe(true);
});
