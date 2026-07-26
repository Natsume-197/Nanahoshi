export type RetryProjection = {
	state: "scheduled" | "exhausted" | "cancelled" | "idle";
	nextRetryAt: string | null;
	attempts: number;
	maxAttempts: number;
};

export function resolveRetryView(retry: RetryProjection | undefined) {
	const automaticRetryAt =
		retry?.state === "scheduled" && retry.nextRetryAt
			? new Date(retry.nextRetryAt)
			: null;
	return {
		automaticRetryAt,
		automaticRetryScheduled:
			retry?.state === "scheduled" && automaticRetryAt != null,
		automaticRetryCancelled: retry?.state === "cancelled",
		providerRetryExhausted: retry?.state === "exhausted",
	};
}
