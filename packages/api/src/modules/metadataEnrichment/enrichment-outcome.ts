import { DEFAULT_PROVIDER_COOLDOWN_MS } from "../../infrastructure/providerGate";
import { isProvisionalMatch } from "./provisional-match";

/**
 * Translates a Catalog Enrichment Pipeline result into the row the tray shows.
 * Both media kinds share this: what differs between written books and
 * Audiobook Quick Match is data (an OutcomePolicy), not a second code path.
 */

export type RawFailure = {
	provider: string;
	phase: "discovery" | "hydration";
	kind: "transient" | "permanent";
	code: string;
	retryAfterMs?: number;
};

export type StampedFailure = RawFailure & { at: string };

export type FailureSummary = {
	/** One timestamp for the whole run, so a row's failures share an `at`. */
	failures: StampedFailure[];
	/**
	 * When a retry is expected to succeed: the longest reported cooldown, or the
	 * default breaker window when a transient failure carried no hint.
	 */
	nextRetryAt: Date | null;
	/** Distinct providers to name in the Deferred Enrichment Retry message. */
	transientProviders: string[];
};

export function summarizeFailures(
	failures: readonly RawFailure[],
): FailureSummary {
	const at = new Date().toISOString();
	const transient = failures.filter((failure) => failure.kind === "transient");
	return {
		failures: failures.map((failure) => ({ ...failure, at })),
		nextRetryAt:
			transient.length === 0
				? null
				: new Date(
						Date.now() +
							Math.max(
								...transient.map(
									(failure) =>
										failure.retryAfterMs ?? DEFAULT_PROVIDER_COOLDOWN_MS,
								),
							),
					),
		transientProviders: [
			...new Set(transient.map((failure) => failure.provider)),
		],
	};
}

/** The user-facing message for a Deferred Enrichment Retry, both media kinds. */
export function providerUnavailableMessage(
	providers: readonly string[],
): string {
	return `Metadata provider${providers.length > 1 ? "s" : ""} temporarily unavailable: ${providers.join(", ")}. Wait a few minutes and try again.`;
}

export type OutcomePolicy = {
	/**
	 * Written books send a judgement-call match to human review. Audiobook Quick
	 * Match selects under its own Audiobookshelf-compatible policy, where a
	 * title-only match is the norm, so supervision there is noise.
	 */
	supervisesProvisionalMatch: boolean;
	/**
	 * A match with no author is treated as incomplete and stays retryable up to
	 * the partial-attempt cap. Audiobook providers routinely drop authorship on
	 * a first pass; for written books an author-less match is not special.
	 */
	treatsAuthorlessAsPartial: boolean;
};

export const BOOK_OUTCOME_POLICY: OutcomePolicy = {
	supervisesProvisionalMatch: true,
	treatsAuthorlessAsPartial: false,
};

export const AUDIOBOOK_OUTCOME_POLICY: OutcomePolicy = {
	supervisesProvisionalMatch: false,
	treatsAuthorlessAsPartial: true,
};

/** What a confirmed match means for the tray row. */
export type MatchOutcome =
	/** A normal run: the status is final for this pass. */
	| { kind: "run"; status: "enriched" | "review" | "partial" }
	/** Missing critical data: counts against the partial-attempt cap. */
	| { kind: "partial_match" };

/**
 * Grade a confirmed match. `retryable` means a provider failed transiently
 * mid-run, so fields it owns may still be missing and the book stays eligible
 * for a later pass whichever media kind it is.
 */
export function resolveMatchOutcome(
	match: {
		retryable: boolean;
		primaryReasons: string[];
		primaryAmbiguous: boolean;
	},
	policy: OutcomePolicy,
	context: { hasAuthors?: boolean } = {},
): MatchOutcome {
	if (policy.treatsAuthorlessAsPartial) {
		const complete = (context.hasAuthors ?? false) && !match.retryable;
		return complete
			? { kind: "run", status: "enriched" }
			: { kind: "partial_match" };
	}
	if (match.retryable) return { kind: "run", status: "partial" };
	const supervised =
		policy.supervisesProvisionalMatch &&
		isProvisionalMatch(match.primaryReasons, {
			ambiguous: match.primaryAmbiguous,
		});
	return { kind: "run", status: supervised ? "review" : "enriched" };
}
