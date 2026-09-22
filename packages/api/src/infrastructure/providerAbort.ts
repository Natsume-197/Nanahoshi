import { AsyncLocalStorage } from "node:async_hooks";

const activeProviderSignal = new AsyncLocalStorage<AbortSignal>();

export function withProviderSignal<T>(
	signal: AbortSignal,
	call: () => Promise<T>,
): Promise<T> {
	return activeProviderSignal.run(signal, call);
}

/** One signal for the phase deadline, caller cancellation and HTTP timeout. */
export function providerRequestSignal(
	local?: AbortSignal | null,
	timeoutMs?: number,
): AbortSignal | undefined {
	const signals = [activeProviderSignal.getStore(), local].filter(
		(signal): signal is AbortSignal => signal != null,
	);
	if (timeoutMs != null) signals.push(AbortSignal.timeout(timeoutMs));
	if (signals.length === 0) return undefined;
	return signals.length === 1 ? signals[0] : AbortSignal.any(signals);
}
