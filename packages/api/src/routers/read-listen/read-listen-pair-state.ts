import { type SQL, sql } from "drizzle-orm";

/**
 * Where an approved Read & Listen pair stands on its way to being usable in the
 * reader: one label per pair, derived from its alignment and latest generation.
 * Declared once and emitted as a TS predicate (views, tests) and a SQL CASE
 * (counts, filtering) — the two MUST stay in lockstep.
 */
export type ReadListenPairState =
	| "generating"
	| "failed"
	| "no_alignment"
	| "ready";

export const READ_LISTEN_PAIR_STATES: readonly ReadListenPairState[] = [
	"generating",
	"failed",
	"no_alignment",
	"ready",
];

export type PairStateFacts = {
	/** Status of the most recent generation attempt, if any. */
	generationStatus: string | null;
	hasAlignment: boolean;
	/** Alignment hashes still match both current source files. */
	alignmentCurrent: boolean;
};

/**
 * First match wins. A valid alignment outranks a failed regeneration: the pair
 * still reads fine, the failure only matters when nothing usable exists. An
 * alignment whose source files changed is not usable either, so it lands in
 * no_alignment with the rest; the pairing view still says why.
 *
 * SQL aliases: `lg` latest generation, `a` alignment, `ab`/`eb` the audiobook
 * and ebook `book` rows.
 */
const RULES: {
	state: ReadListenPairState;
	ts: (facts: PairStateFacts) => boolean;
	sql: SQL;
}[] = [
	{
		state: "generating",
		ts: (facts) =>
			facts.generationStatus === "queued" ||
			facts.generationStatus === "running",
		sql: sql`lg.status IN ('queued', 'running')`,
	},
	{
		state: "ready",
		ts: (facts) => facts.hasAlignment && facts.alignmentCurrent,
		sql: sql`a.id IS NOT NULL AND a.ebook_catalog_hash = eb.filehash AND a.audiobook_catalog_hash = ab.filehash`,
	},
	{
		state: "failed",
		ts: (facts) => facts.generationStatus === "failed",
		sql: sql`lg.status = 'failed'`,
	},
	{
		state: "no_alignment",
		ts: () => true,
		sql: sql`TRUE`,
	},
];

export function resolvePairState(facts: PairStateFacts): ReadListenPairState {
	for (const rule of RULES) {
		if (rule.ts(facts)) return rule.state;
	}
	return "no_alignment";
}

/** `CASE … END` yielding the pair state, mirroring {@link resolvePairState}. */
export function pairStateCaseSql(): SQL {
	const whens = RULES.map((rule) => sql`WHEN ${rule.sql} THEN ${rule.state}`);
	return sql`CASE ${sql.join(whens, sql` `)} ELSE 'no_alignment' END`;
}
