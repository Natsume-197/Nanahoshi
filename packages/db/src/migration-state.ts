// Pure module (no db/env imports) so it stays testable without infrastructure.

export type MigrationState =
	/** An empty database: the first start installs everything. */
	| { status: "fresh"; pending: number }
	| { status: "current"; pending: 0 }
	/** This release brings migrations the database hasn't run. */
	| { status: "pending"; pending: number }
	/**
	 * The database ran migrations this release doesn't know: a newer Nanahoshi
	 * migrated it. Older code can't be trusted with that schema.
	 */
	| { status: "newer"; pending: 0 };

/**
 * Compare the migrations this build ships (`journalWhens`, the `when` of each
 * journal entry) with the newest one the database recorded. Drizzle applies
 * every journal entry newer than the database's newest `created_at`, so the
 * same rule decides what is pending.
 */
export function classifyMigrations(
	journalWhens: number[],
	appliedNewest: number | null,
): MigrationState {
	if (appliedNewest === null) {
		return { status: "fresh", pending: journalWhens.length };
	}
	const shippedNewest = Math.max(0, ...journalWhens);
	if (appliedNewest > shippedNewest) return { status: "newer", pending: 0 };
	const pending = journalWhens.filter((when) => when > appliedNewest).length;
	return pending > 0
		? { status: "pending", pending }
		: { status: "current", pending: 0 };
}
