import { describe, expect, test } from "bun:test";
import { providerQuotaScope } from "../providerQuotaScope";

describe("providerQuotaScope", () => {
	test("uses the same stable context for tenant and regional quotas", () => {
		expect(
			providerQuotaScope("amazon", {
				serverId: "server-a",
				amazonDomain: "co.jp",
			}),
		).toBe("org:server-a:domain:co.jp");
		expect(providerQuotaScope("googlebooks", { serverId: "server-a" })).toBe(
			"org:server-a",
		);
		expect(providerQuotaScope("audible", { region: "jp" })).toBe("region:jp");
	});

	test("uses the provider's real default audiobook region", () => {
		expect(providerQuotaScope("audible")).toBe("region:us");
		expect(providerQuotaScope("itunes")).toBe("region:us");
	});
});
