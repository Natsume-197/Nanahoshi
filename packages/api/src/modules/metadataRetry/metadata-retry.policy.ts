export const MAX_PROVIDER_RETRY_ATTEMPTS = 3;

export type RetryFailure = {
	kind: "transient" | "permanent";
	code: string;
};

/**
 * A Redis gate hit performs no external request and therefore never consumes
 * the bounded provider-call budget.
 */
export function consumesProviderAttempt(
	failures: readonly RetryFailure[],
): boolean {
	return failures.some(
		(failure) =>
			failure.kind === "transient" && failure.code !== "provider_cooldown",
	);
}
