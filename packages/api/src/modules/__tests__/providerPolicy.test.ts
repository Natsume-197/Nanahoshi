import { describe, expect, test } from "bun:test";
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
