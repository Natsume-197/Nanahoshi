import { beforeEach, describe, expect, test } from "bun:test";
import { providerGate } from "../../../infrastructure/providerGate";
import { providerQuotaScope } from "../../../infrastructure/providerQuotaScope";
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

const breakerTransient = () =>
	new CatalogProviderError("transient", "rate_limited", {
		opensCircuitBreaker: true,
	});

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

describe("only breaker-worthy transient failures open the breaker", () => {
	test("a provider phase has a bounded deadline and remains retryable", async () => {
		let observedAbort = false;
		const gated = withProviderGate(
			stubAdapter({
				discover: (_query, _metadata, signal) =>
					new Promise((_resolve, reject) => {
						signal?.addEventListener(
							"abort",
							() => {
								observedAbort = true;
								reject(signal.reason);
							},
							{ once: true },
						);
					}),
			}),
			() => ({ serverId: "acme" }),
			10,
		);

		await expect(gated.discover({ kind: "book" }, {})).rejects.toMatchObject({
			kind: "transient",
			code: "provider_timeout",
		});
		expect(observedAbort).toBe(true);
	});

	test("a network failure stays retryable without cooling down the provider", async () => {
		const gated = withProviderGate(
			stubAdapter({
				discover: async () => {
					throw new CatalogProviderError("transient", "network_error", {
						retryAfterMs: 15_000,
					});
				},
			}),
			() => ({ serverId: "acme" }),
		);

		await expect(gated.discover({ kind: "book" }, {})).rejects.toThrow();
		expect(
			await providerGate.cooldownRemainingMs(
				"amazon",
				"org:acme:domain:default",
			),
		).toBeNull();
	});

	test("from discovery", async () => {
		const gated = withProviderGate(
			stubAdapter({
				discover: async () => {
					throw breakerTransient();
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
					throw breakerTransient();
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
						throw breakerTransient();
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
	test("credential quotas follow the effective credential without exposing it", () => {
		const first = providerQuotaScope("googlebooks", {
			serverId: "one",
			credential: "shared-secret",
		});
		const second = providerQuotaScope("googlebooks", {
			serverId: "two",
			credential: "shared-secret",
		});
		const other = providerQuotaScope("googlebooks", {
			serverId: "one",
			credential: "another-secret",
		});

		expect(first).toBe(second);
		expect(first).not.toBe(other);
		expect(first).not.toContain("shared-secret");
	});

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

describe("distributed request pacing", () => {
	test("reserves one ordered slot for concurrent callers in the same quota scope", async () => {
		const startedAt = Date.now();
		const calls = await Promise.all(
			Array.from({ length: 3 }, async () => {
				await providerGate.waitForSlot("googlebooks", "org:acme", 25);
				return Date.now() - startedAt;
			}),
		);
		expect((calls[1] ?? 0) - (calls[0] ?? 0)).toBeGreaterThanOrEqual(15);
		expect((calls[2] ?? 0) - (calls[1] ?? 0)).toBeGreaterThanOrEqual(15);
	});

	test("does not serialize independent quota scopes", async () => {
		await providerGate.waitForSlot("googlebooks", "org:acme", 100);
		const startedAt = Date.now();
		await providerGate.waitForSlot("googlebooks", "org:other", 100);
		expect(Date.now() - startedAt).toBeLessThan(50);
	});
});
