import type { CatalogIdentifier } from "./types";

export type CatalogProviderMatch = {
	provider: string;
	providerId: string;
};

type EditionIdentityRule = {
	granularity: "edition";
	idPattern?: RegExp;
};

/** Explicit provider contract: omitted providers do not expose edition identity. */
const EDITION_IDENTITY_RULES: Readonly<Record<string, EditionIdentityRule>> = {
	ranobedb: { granularity: "edition" },
	amazon: { granularity: "edition" },
	googlebooks: { granularity: "edition" },
	goodreads: { granularity: "edition" },
	openlibrary: { granularity: "edition", idPattern: /^books\// },
	comicvine: { granularity: "edition", idPattern: /^4000-/ },
};

/**
 * Qualifies a primary provider record as Logical Edition evidence. Work-level
 * and mixed-granularity provider records deliberately return null: their
 * bibliographic fields may still provide ISBN/ASIN evidence independently.
 */
export function providerEditionIdentifier(
	match: CatalogProviderMatch,
): CatalogIdentifier | null {
	const provider = match.provider.trim().toLowerCase();
	const providerId = match.providerId.trim();
	if (!providerId) return null;

	const rule = EDITION_IDENTITY_RULES[provider];
	if (!rule || (rule.idPattern && !rule.idPattern.test(providerId)))
		return null;

	return {
		scheme: "providerEdition",
		value: JSON.stringify([provider, providerId]),
	};
}

/** Only the first enrichment match is authoritative; later matches supplement it. */
export function primaryProviderEditionMatch(
	value: unknown,
): { match: CatalogProviderMatch; identifier: CatalogIdentifier } | null {
	if (!Array.isArray(value)) return null;
	const primary = value[0];
	if (!primary || typeof primary !== "object") return null;
	const { provider, providerId } = primary as Record<string, unknown>;
	if (typeof provider !== "string" || typeof providerId !== "string")
		return null;
	const match = { provider, providerId };
	const identifier = providerEditionIdentifier(match);
	return identifier ? { match, identifier } : null;
}
