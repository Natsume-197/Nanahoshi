import { createHash } from "node:crypto";

export type ProviderQuotaContext = {
	serverId?: string | null;
	amazonDomain?: string;
	region?: string;
	/** Effective provider credential; only its one-way fingerprint enters Redis. */
	credential?: string;
	/** Pre-resolved scope supplied by a provider that owns credential lookup. */
	quotaScope?: string;
};

function credentialScope(credential: string): string {
	return `credential:${createHash("sha256").update(credential).digest("hex").slice(0, 24)}`;
}

/**
 * Stable, non-secret identity of the external quota bucket. Tenant credentials
 * stay isolated; public APIs that share an instance/IP use a shared bucket.
 */
export function providerQuotaScope(
	provider: string,
	context: ProviderQuotaContext = {},
): string {
	if (context.quotaScope) return context.quotaScope;
	switch (provider) {
		case "amazon":
			return `org:${context.serverId ?? "instance"}:domain:${context.amazonDomain ?? "default"}`;
		case "googlebooks":
		case "hardcover":
		case "comicvine":
			return context.credential
				? credentialScope(context.credential)
				: `org:${context.serverId ?? "instance"}`;
		case "audible":
		case "itunes":
			return `region:${context.region ?? "us"}`;
		default:
			return "shared";
	}
}
