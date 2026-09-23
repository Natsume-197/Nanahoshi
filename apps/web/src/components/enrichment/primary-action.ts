import type { EnrichmentLifecycle } from "./filters";

export type PrimaryRowAction = "approve" | "details" | "fix" | "retry";

/** The one action most likely to move a row forward from its current state. */
export function primaryActionForLifecycle(
	lifecycle: EnrichmentLifecycle,
): PrimaryRowAction {
	switch (lifecycle) {
		case "review":
			return "approve";
		case "unresolved":
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

export type SecondaryRowAction = "approve" | "fix" | "retry" | "cancelRetry";

/** What the row's ⋯ menu offers: everything available except the primary. */
export function secondaryActionsForLifecycle(
	lifecycle: EnrichmentLifecycle,
): SecondaryRowAction[] {
	const available: SecondaryRowAction[] =
		lifecycle === "running"
			? []
			: lifecycle === "scheduled"
				? ["cancelRetry", "retry"]
				: lifecycle === "review"
					? ["approve", "fix", "retry"]
					: ["fix", "retry"];
	const primary = primaryActionForLifecycle(lifecycle);
	return available.filter((action) => action !== primary);
}
