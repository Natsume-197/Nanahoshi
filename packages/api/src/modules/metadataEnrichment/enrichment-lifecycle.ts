import type {
	EnrichmentDecision,
	EnrichmentStatus,
} from "@nanahoshi-v2/db/schema/general";
import { type SQL, sql } from "drizzle-orm";
import { MAX_PROVIDER_RETRY_ATTEMPTS } from "../metadataRetry/metadata-retry.policy";

/**
 * The single, human-facing state of a book in the metadata tray. Collapses two
 * orthogonal DB axes — match quality (`enrichment_state.status`) and transient
 * provider-retry state (`next_retry_at`) — into one label.
 */
export type EnrichmentLifecycle =
	| "scheduled"
	| "review"
	| "unresolved"
	| "no_match"
	| "partial"
	| "failed"
	| "running"
	| "done";

/** Task-oriented tray view. Each lifecycle belongs to exactly one bucket. */
export type EnrichmentBucket = "in_progress" | "attention" | "completed";

export const LIFECYCLE_BUCKET: Record<EnrichmentLifecycle, EnrichmentBucket> = {
	scheduled: "in_progress",
	review: "attention",
	unresolved: "attention",
	no_match: "attention",
	partial: "attention",
	failed: "attention",
	running: "in_progress",
	done: "completed",
};

export type LifecycleRow = {
	status: EnrichmentStatus;
	nextRetryAt: string | null;
	providerAttempts: number;
	hasFailures: boolean;
	decision: EnrichmentDecision | null;
};

/**
 * Ordered precedence rules — first match wins. The TS predicate and the SQL
 * fragment MUST stay in lockstep: the service derives each row's lifecycle in
 * TS, while counts and bucket filtering run the SQL form over 80k+ rows. Any
 * divergence would place a row in a bucket its chip disagrees with.
 *
 * The SQL fragments reference the `es` alias (enrichment_state) used by the
 * repository's raw list/count queries.
 */
const RULES: {
	lifecycle: EnrichmentLifecycle;
	ts: (row: LifecycleRow) => boolean;
	sql: SQL;
}[] = [
	{
		lifecycle: "scheduled",
		ts: (row) => row.nextRetryAt != null,
		sql: sql`es.next_retry_at IS NOT NULL`,
	},
	{
		lifecycle: "review",
		ts: (row) => row.status === "review",
		sql: sql`es.status = 'review'`,
	},
	{
		lifecycle: "unresolved",
		ts: (row) =>
			row.status === "no_match" && row.decision?.kind === "ambiguous",
		sql: sql`es.status = 'no_match' AND es.decision->>'kind' = 'ambiguous'`,
	},
	{
		lifecycle: "no_match",
		ts: (row) => row.status === "no_match",
		sql: sql`es.status = 'no_match'`,
	},
	{
		lifecycle: "partial",
		ts: (row) => row.status === "partial",
		sql: sql`es.status = 'partial'`,
	},
	{
		lifecycle: "failed",
		ts: (row) =>
			row.status === "pending" &&
			row.hasFailures &&
			row.providerAttempts >= MAX_PROVIDER_RETRY_ATTEMPTS,
		sql: sql`es.status = 'pending' AND jsonb_array_length(es.failures) > 0 AND es.provider_attempts >= ${MAX_PROVIDER_RETRY_ATTEMPTS}`,
	},
	{
		lifecycle: "running",
		ts: (row) => row.status === "pending",
		sql: sql`es.status = 'pending'`,
	},
	{
		lifecycle: "done",
		ts: (row) => row.status === "enriched",
		sql: sql`es.status = 'enriched'`,
	},
];

/** Derive a row's lifecycle. Every valid row matches a rule; the final `done`
 * rule catches `enriched`, so the fallback is defensive only. */
export function resolveLifecycle(row: LifecycleRow): EnrichmentLifecycle {
	for (const rule of RULES) {
		if (rule.ts(row)) return rule.lifecycle;
	}
	return "running";
}

export function resolveBucket(row: LifecycleRow): EnrichmentBucket {
	return LIFECYCLE_BUCKET[resolveLifecycle(row)];
}

/** `CASE … END` yielding the lifecycle string, mirroring {@link resolveLifecycle}. */
export function lifecycleCaseSql(): SQL {
	const whens = RULES.map(
		(rule) => sql`WHEN ${rule.sql} THEN ${rule.lifecycle}`,
	);
	return sql`CASE ${sql.join(whens, sql` `)} ELSE 'running' END`;
}

/** `CASE … END` yielding the bucket string, for `GROUP BY` and bucket filters. */
export function bucketCaseSql(): SQL {
	const whens = RULES.map(
		(rule) => sql`WHEN ${rule.sql} THEN ${LIFECYCLE_BUCKET[rule.lifecycle]}`,
	);
	return sql`CASE ${sql.join(whens, sql` `)} ELSE 'in_progress' END`;
}
