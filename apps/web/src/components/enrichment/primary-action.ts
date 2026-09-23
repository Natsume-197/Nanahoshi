import type { EnrichmentLifecycle } from "./filters";

export type PrimaryRowAction =
	| "approve"
	| "choose"
	| "details"
	| "fix"
	| "retry";

/** The one action most likely to move a row forward from its current state. */
export function primaryActionForLifecycle(
	lifecycle: EnrichmentLifecycle,
): PrimaryRowAction {
	switch (lifecycle) {
		case "review":
			return "approve";
		// The candidates live in the detail pane, so the row opens it.
		case "unresolved":
			return "choose";
		case "no_match":
		case "partial":
			return "fix";
		case "scheduled":
		case "failed":
			return "retry";
		case "running":
		case "done":
			return "details";
	}
}
