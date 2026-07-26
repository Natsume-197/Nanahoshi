import type { MetadataProviderRouting } from "@nanahoshi-v2/db/schema/general";

// Per-field provider routing policy, shared by ebook and audiobook enrichment.
//
// A library's `metadata_providers` jsonb holds either the legacy shape
// (`["ranobedb","amazon"]` — an ordered chain) or the routed shape
// (`{ order: [...], fields: { description: ["ranobedb"], cover: ["amazon"] } }`).
// `order` is the chain and the default per-field priority; `fields` overrides
// the priority (and the allowed set) for specific fields. Profile-backed
// policies may also declare an authoritative primary provider: supplemental
// providers cannot establish the catalog match when it is unavailable.

/** The stored routing, narrowed to the provider ids one media kind allows. */
export type ProviderFieldPolicy<P extends string> = {
	order: readonly P[];
	fields?: Readonly<Partial<Record<string, readonly P[]>>>;
	primary?: P;
	profile?: MetadataProviderRouting["profile"];
};

/**
 * What may actually be sitting in the column: the stored shape, but with every
 * part treated as possibly absent. Rows predate the current shape and jsonb is
 * unchecked, so normalization re-validates each field at runtime.
 */
export type RawProviderConfig =
	| string[]
	| (Partial<MetadataProviderRouting> & {
			profile?: Partial<NonNullable<MetadataProviderRouting["profile"]>>;
	  })
	| null
	| undefined;

/** Accepts both stored shapes; unknown provider ids are dropped, empty order falls back. */
export function normalizeProviderPolicy<P extends string>(
	raw: RawProviderConfig,
	isProvider: (value: string) => value is P,
	defaultOrder: readonly P[],
): ProviderFieldPolicy<P> {
	const rawOrder = Array.isArray(raw) ? raw : (raw?.order ?? []);
	const order = rawOrder.filter(isProvider);
	const rawFields = Array.isArray(raw) ? undefined : raw?.fields;
	const rawPrimary = Array.isArray(raw) ? undefined : raw?.primary;
	const rawProfile = Array.isArray(raw) ? undefined : raw?.profile;
	const effectiveOrder = order.length > 0 ? order : [...defaultOrder];
	const fields: Partial<Record<string, readonly P[]>> = {};
	for (const [field, providers] of Object.entries(rawFields ?? {})) {
		if (!Array.isArray(providers)) continue;
		fields[field] = providers.filter(isProvider);
	}
	const primary =
		rawPrimary != null &&
		isProvider(rawPrimary) &&
		effectiveOrder.includes(rawPrimary)
			? rawPrimary
			: undefined;
	const profile =
		rawProfile?.id &&
		typeof rawProfile.version === "number" &&
		Number.isInteger(rawProfile.version) &&
		rawProfile.version > 0
			? { id: rawProfile.id, version: rawProfile.version }
			: undefined;
	return {
		order: effectiveOrder,
		fields: Object.keys(fields).length > 0 ? fields : undefined,
		...(primary && { primary }),
		...(profile && { profile }),
	};
}

/**
 * Priority rank of a provider for one field: 0 = best, Infinity = not allowed.
 * With no field rule every provider in the chain may serve the field in chain
 * order; a field rule restricts the allowed set AND defines its own order.
 */
export function providerFieldRank<P extends string>(
	policy: ProviderFieldPolicy<P>,
	field: string,
	provider: P,
): number {
	const list = policy.fields?.[field] ?? policy.order;
	const rank = list.indexOf(provider);
	return rank === -1 ? Number.POSITIVE_INFINITY : rank;
}

/** Whether the provider is allowed to contribute this field at all. */
export function providerAllowedForField<P extends string>(
	policy: ProviderFieldPolicy<P>,
	field: string,
	provider: P,
): boolean {
	return (
		providerFieldRank(policy, field, provider) !== Number.POSITIVE_INFINITY
	);
}
