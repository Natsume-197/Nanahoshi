const MAX_RETRIES = 3;

/** A request that failed on the way (network, timeout, server down or
 * restarting) is worth asking again; one the server refused is not. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
	if (failureCount >= MAX_RETRIES) return false;
	const status = (error as { status?: unknown } | null)?.status;
	if (typeof status !== "number") return true;
	return status >= 500 || status === 408 || status === 429;
}
