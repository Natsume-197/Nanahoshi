import { MAX_PROVIDER_RETRY_ATTEMPTS } from "./metadata-retry.policy";

export type MetadataRetryProjection =
	| {
			state: "scheduled";
			nextRetryAt: string;
			attempts: number;
			maxAttempts: number;
	  }
	| {
			state: "exhausted";
			nextRetryAt: null;
			attempts: number;
			maxAttempts: number;
	  }
	| {
			state: "idle";
			nextRetryAt: null;
			attempts: number;
			maxAttempts: number;
	  }
	| {
			state: "cancelled";
			nextRetryAt: null;
			attempts: number;
			maxAttempts: number;
	  };

export function metadataRetryProjection(input: {
	nextRetryAt: string | null;
	providerAttempts: number | null;
	retryCancelledAt: string | null;
	hasFailures: boolean;
}): MetadataRetryProjection {
	const attempts = input.providerAttempts ?? 0;
	if (input.retryCancelledAt) {
		return {
			state: "cancelled",
			nextRetryAt: null,
			attempts,
			maxAttempts: MAX_PROVIDER_RETRY_ATTEMPTS,
		};
	}
	if (input.nextRetryAt) {
		return {
			state: "scheduled",
			nextRetryAt: input.nextRetryAt,
			attempts,
			maxAttempts: MAX_PROVIDER_RETRY_ATTEMPTS,
		};
	}
	if (input.hasFailures && attempts >= MAX_PROVIDER_RETRY_ATTEMPTS) {
		return {
			state: "exhausted",
			nextRetryAt: null,
			attempts,
			maxAttempts: MAX_PROVIDER_RETRY_ATTEMPTS,
		};
	}
	return {
		state: "idle",
		nextRetryAt: null,
		attempts,
		maxAttempts: MAX_PROVIDER_RETRY_ATTEMPTS,
	};
}
