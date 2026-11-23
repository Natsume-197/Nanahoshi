export const SESSION_RATE_LIMIT_ERROR_CODE = "auth_session_rate_limited";
export const SESSION_UNAVAILABLE_ERROR_CODE = "auth_session_unavailable";
export const SERVER_UNREACHABLE_ERROR_CODE = "server_unreachable";

/** Signing in or setting up starts by asking the server about itself; when it
 * doesn't answer, say that (with a retry) rather than a raw fetch error. */
export async function reachServer<T>(ask: () => Promise<T>): Promise<T> {
	try {
		return await ask();
	} catch {
		throw new Error(SERVER_UNREACHABLE_ERROR_CODE);
	}
}

type SessionLookupError = {
	status?: number;
};

type SessionLookupResult<T> = {
	data: T | null;
	error: SessionLookupError | null;
};

export function resolveSessionLookup<T>(
	result: SessionLookupResult<T>,
): T | null {
	if (result.error) {
		throw new Error(
			result.error.status === 429
				? SESSION_RATE_LIMIT_ERROR_CODE
				: SESSION_UNAVAILABLE_ERROR_CODE,
		);
	}
	return result.data ?? null;
}

export function getSessionErrorKind(
	error: unknown,
): "rate_limited" | "unavailable" | "unreachable" | null {
	const message =
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string"
			? error.message
			: null;
	if (message?.includes(SESSION_RATE_LIMIT_ERROR_CODE)) return "rate_limited";
	if (message?.includes(SESSION_UNAVAILABLE_ERROR_CODE)) return "unavailable";
	if (message?.includes(SERVER_UNREACHABLE_ERROR_CODE)) return "unreachable";
	return null;
}
