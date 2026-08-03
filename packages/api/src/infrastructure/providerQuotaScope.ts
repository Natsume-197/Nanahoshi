export type ProviderQuotaContext = {
	serverId?: string | null;
	amazonDomain?: string;
	region?: string;
};

/**
 * Stable, non-secret identity of the external quota bucket. Tenant credentials
 * stay isolated; public APIs that share an instance/IP use a shared bucket.
 */
export function providerQuotaScope(
	provider: string,
	context: ProviderQuotaContext = {},
): string {
	switch (provider) {
		case "amazon":
			return `org:${context.serverId ?? "instance"}:domain:${context.amazonDomain ?? "default"}`;
		case "googlebooks":
		case "hardcover":
		case "comicvine":
			return `org:${context.serverId ?? "instance"}`;
		case "audible":
		case "itunes":
			return `region:${context.region ?? "us"}`;
		default:
			return "shared";
	}
}
