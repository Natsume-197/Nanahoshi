// Per-field provider routing policy, shared by ebook and audiobook enrichment.
//
// A library's `metadata_providers` jsonb holds either the legacy shape
// (`["ranobedb","amazon"]` — an ordered chain) or the routed shape
// (`{ order: [...], fields: { description: ["ranobedb"], cover: ["amazon"] } }`).
// `order` is the chain and the default per-field priority; `fields` overrides
// the priority (and the allowed set) for specific fields.

export type ProviderFieldPolicy<P extends string> = {
	order: readonly P[];
	fields?: Readonly<Partial<Record<string, readonly P[]>>>;
};

export type RawProviderConfig =
	| string[]
	| { order?: string[]; fields?: Record<string, string[]> }
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
	const fields: Partial<Record<string, readonly P[]>> = {};
	for (const [field, providers] of Object.entries(rawFields ?? {})) {
		if (!Array.isArray(providers)) continue;
		fields[field] = providers.filter(isProvider);
	}
	return {
		order: order.length > 0 ? order : defaultOrder,
		fields: Object.keys(fields).length > 0 ? fields : undefined,
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
