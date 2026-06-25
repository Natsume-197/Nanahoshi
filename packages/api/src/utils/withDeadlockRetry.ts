// Retries an idempotent DB op on deadlock (40P01) / serialization (40001).
// Callers order their multi-row inserts to avoid deadlocks; this is the backstop.
const RETRYABLE = new Set(["40P01", "40001"]);

// Drizzle wraps the driver error, so the SQLSTATE lives on err.cause (sometimes
// nested), not err.code. Walk the whole cause chain to find it.
function retryableCode(err: unknown): boolean {
	let cur: unknown = err;
	for (let depth = 0; cur && depth < 5; depth++) {
		const code = (cur as { code?: unknown }).code;
		if (typeof code === "string" && RETRYABLE.has(code)) return true;
		cur = (cur as { cause?: unknown }).cause;
	}
	return false;
}

export async function withDeadlockRetry<T>(
	fn: () => Promise<T>,
	maxRetries = 4,
): Promise<T> {
	for (let attempt = 0; ; attempt++) {
		try {
			return await fn();
		} catch (err) {
			if (retryableCode(err) && attempt < maxRetries) {
				await new Promise((resolve) =>
					setTimeout(resolve, 25 * 2 ** attempt + Math.random() * 25),
				);
				continue;
			}
			throw err;
		}
	}
}
