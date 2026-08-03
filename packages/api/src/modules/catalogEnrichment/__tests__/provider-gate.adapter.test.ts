import { beforeEach, describe, expect, test } from "bun:test";
import { providerGate } from "../../../infrastructure/providerGate";
import { CatalogProviderError } from "../catalogEnrichment";
import { withProviderGate } from "../provider-gate.adapter";
import type { CatalogProviderAdapter } from "../types";

type Meta = { serverId?: string | null; amazonDomain?: string };

function stubAdapter(
	overrides: Partial<CatalogProviderAdapter<"amazon", Meta>> = {},
): CatalogProviderAdapter<"amazon", Meta> {
	return {
		id: "amazon",
		discover: async () => [],
		hydrate: async () => null,
		...overrides,
	};
}

const transient = () =>
	new CatalogProviderError("transient", "provider_unavailable");

beforeEach(() => {
	providerGate.clearAllInMemory();
});

describe("cooldown is enforced on every phase", () => {
	test("discovery fails fast while the breaker is open", async () => {
		await providerGate.trip("amazon", 60_000, "org:acme:domain:default");
		const gated = withProviderGate(stubAdapter(), (meta) => ({
			serverId: "acme",
			amazonDomain: meta.amazonDomain,
		}));

		await expect(
			gated.discover({ kind: "book" }, { serverId: "acme" }),
		).rejects.toThrow("provider_cooldown");
	});

	// The bug the decorator removes: both adapters computed a quota scope in
	// hydrate() and then never checked it.
	test("hydration fails fast too, using the scope discovery resolved", async () => {
		const gated = withProviderGate(stubAdapter(), () => ({
			serverId: "acme",
		}));
		await gated.discover({ kind: "book" }, { serverId: "acme" });
		await providerGate.trip("amazon", 60_000, "org:acme:domain:default");

		await expect(
			gated.hydrate({
				providerId: "x",
				metadata: {},
				evidence: { kind: "book" },
			}),
		).rejects.toThrow("provider_cooldown");
	});
});

describe("a transient failure opens the breaker", () => {
	test("from discovery", async () => {
		const gated = withProviderGate(
			stubAdapter({
				discover: async () => {
					throw transient();
				},
			}),
			() => ({ serverId: "acme" }),
		);

		await expect(gated.discover({ kind: "book" }, {})).rejects.toThrow();
		await Bun.sleep(0);
		expect(
			await providerGate.cooldownRemainingMs(
				"amazon",
				"org:acme:domain:default",
			),
		).not.toBeNull();
	});

	test("from hydration", async () => {
		const gated = withProviderGate(
			stubAdapter({
				hydrate: async () => {
					throw transient();
				},
			}),
			() => ({ serverId: "acme" }),
		);
		await gated.discover({ kind: "book" }, {});

		await expect(
			gated.hydrate({
				providerId: "x",
				metadata: {},
				evidence: { kind: "book" },
			}),
		).rejects.toThrow();
		await Bun.sleep(0);
		expect(
			await providerGate.cooldownRemainingMs(
				"amazon",
				"org:acme:domain:default",
			),
		).not.toBeNull();
	});

	test("one Amazon failure stops concurrent calls before they reach the provider", async () => {
		let releaseFirst: (() => void) | undefined;
		const firstMayFail = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		let calls = 0;
		const gated = withProviderGate(
			stubAdapter({
				discover: async () => {
					calls++;
					if (calls === 1) {
						await firstMayFail;
						throw transient();
					}
					return [];
				},
			}),
			() => ({ serverId: "acme", amazonDomain: "co.jp" }),
		);

		const first = gated.discover({ kind: "book" }, {});
		await Bun.sleep(0);
		const second = gated.discover({ kind: "book" }, {});
		releaseFirst?.();
		await Promise.allSettled([first, second]);

		expect(calls).toBe(1);
	});
});

describe("scoping", () => {
	test("a permanent failure leaves the breaker closed", async () => {
		const gated = withProviderGate(
			stubAdapter({
				discover: async () => {
					throw new CatalogProviderError("permanent", "bad_payload");
				},
			}),
			() => ({ serverId: "acme" }),
		);

		await expect(gated.discover({ kind: "book" }, {})).rejects.toThrow();
		await Bun.sleep(0);
		expect(
			await providerGate.cooldownRemainingMs(
				"amazon",
				"org:acme:domain:default",
			),
		).toBeNull();
	});

	test("one tenant's cooldown does not block another", async () => {
		await providerGate.trip("amazon", 60_000, "org:acme:domain:default");
		const gated = withProviderGate(stubAdapter(), (meta) => ({
			serverId: meta.serverId,
			amazonDomain: meta.amazonDomain,
		}));

		// A different server is a different Provider Quota Scope.
		expect(
			await gated.discover({ kind: "book" }, { serverId: "other" }),
		).toEqual([]);
	});
});
