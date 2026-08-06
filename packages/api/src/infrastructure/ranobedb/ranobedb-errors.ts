// Pure, dependency-free so it can be unit-tested without booting the pg pool or
// validating server env. Kept out of ranobedb.client.ts for that reason.

/**
 * RanobeDB is present but could not answer right now (connection refused,
 * pool exhausted, DB restarting…). Distinct from "RanobeDB isn't imported":
 * the enrichment pipeline must retry on this instead of recording a permanent
 * `no_match`, which it would do if we swallowed the error into an empty result.
 */
export class RanobedbUnavailableError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "RanobedbUnavailableError";
	}
}

// Connection-level SQLSTATE classes (postgres): 08 = connection exception,
// 57 = operator intervention (shutdown, cannot-connect-now, statement timeout),
// 53 = insufficient resources, plus serialization/deadlock/lock-timeout.
const TRANSIENT_SQLSTATES = new Set([
	"08000",
	"08001",
	"08003",
	"08004",
	"08006",
	"08007",
	"08P01",
	"57P01", // admin_shutdown
	"57P02", // crash_shutdown
	"57P03", // cannot_connect_now (DB starting up / in recovery)
	"57P05", // idle_session_timeout
	"57014", // query_canceled (statement/idle timeout)
	"53000",
	"53100",
	"53200", // out_of_memory
	"53300", // too_many_connections
	"53400",
	"40001", // serialization_failure
	"40P01", // deadlock_detected
	"55P03", // lock_not_available
]);

// Node socket/DNS errors surfaced by the pg driver when it can't reach the host.
const TRANSIENT_SYSCODES = new Set([
	"ECONNREFUSED",
	"ECONNRESET",
	"ETIMEDOUT",
	"EPIPE",
	"ENOTFOUND",
	"EHOSTUNREACH",
	"ENETUNREACH",
	"EAI_AGAIN",
]);

// Pool-level failures often arrive as a bare Error with no code (e.g.
// "Connection terminated unexpectedly", "timeout exceeded when trying to
// connect"). Match those by message as a last resort.
const TRANSIENT_MESSAGE =
	/econn|etimedout|connection\s+(?:terminat|tim(?:e|ed)?out|refused|reset|closed)|terminating connection|too many clients|cannot connect now|starting up|shutting down|server closed the connection|timeout exceeded/i;

/**
 * True when the error means "RanobeDB is reachable-but-unavailable / flaky",
 * false when it means "RanobeDB isn't set up" (missing database/table, schema
 * drift) or any other query-level fault — those stay a soft, non-retried miss.
 */
export function isTransientDbError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const code = (error as { code?: unknown }).code;
	if (typeof code === "string") {
		if (TRANSIENT_SQLSTATES.has(code) || TRANSIENT_SYSCODES.has(code)) {
			return true;
		}
		// A recognised SQLSTATE that isn't in the transient set (e.g. 3D000
		// invalid_catalog_name, 42P01 undefined_table) is a structural miss.
		if (/^[0-9A-Z]{5}$/.test(code)) return false;
	}
	const message = (error as { message?: unknown }).message;
	return typeof message === "string" && TRANSIENT_MESSAGE.test(message);
}
