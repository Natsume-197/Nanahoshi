/**
 * Calls `call` until it resolves, every `delayMs`, at most `tries` times or
 * until `stopped()`. For native views whose methods reject until their first
 * layout pass (an Expo UI SnackbarHost right after it mounts).
 */
export async function untilReady<T>(
	call: () => Promise<T>,
	{
		tries = 20,
		delayMs = 50,
		stopped = () => false,
	}: { tries?: number; delayMs?: number; stopped?: () => boolean } = {},
): Promise<T> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await call();
		} catch (error) {
			if (attempt >= tries || stopped()) throw error;
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			if (stopped()) throw error;
		}
	}
}
