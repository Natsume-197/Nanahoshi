// Shared state vocabulary for the match manager: one source of truth for how a
// lifecycle is named and coloured, so the sidebar dot, the row chip and the
// detail pane can never disagree about what a book's state looks like.

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import type { EnrichmentLifecycle as Lifecycle } from "./filters";

export type EnrichmentStatus =
	| "pending"
	| "enriched"
	| "partial"
	| "no_match"
	| "review";

export const LIFECYCLE_LABELS: Record<Lifecycle, () => string> = {
	running: () => m["enrichment.lc_running"](),
	scheduled: () => m["enrichment.lc_scheduled"](),
	review: () => m["enrichment.lc_review"](),
	unresolved: () => m["enrichment.lc_unresolved"](),
	no_match: () => m["enrichment.lc_no_match"](),
	partial: () => m["enrichment.lc_partial"](),
	failed: () => m["enrichment.lc_failed"](),
	done: () => m["enrichment.lc_done"](),
};

type LifecycleTone =
	| "info"
	| "secondary"
	| "destructive"
	| "warning"
	| "success"
	| "outline";

export const LIFECYCLE_VARIANTS = {
	running: "info",
	scheduled: "info",
	review: "warning",
	unresolved: "warning",
	no_match: "destructive",
	partial: "warning",
	failed: "destructive",
	done: "success",
} as const satisfies Record<Lifecycle, LifecycleTone>;

// Solid dot fill per tone. Tones are shared across lifecycles on purpose
// (review/partial are both warning, no_match/failed both destructive) — the dot
// groups states by severity and the nav label names them, so the dot must stay
// legible at 8px in both themes but never carries the distinction alone.
const TONE_DOT: Record<LifecycleTone, string> = {
	info: "bg-info",
	secondary: "bg-muted-foreground/50",
	destructive: "bg-destructive",
	warning: "bg-warning",
	success: "bg-success",
	outline: "bg-muted-foreground/30",
};

export function lifecycleDotClass(lifecycle: Lifecycle): string {
	return TONE_DOT[LIFECYCLE_VARIANTS[lifecycle]];
}

export function LifecycleDot({
	lifecycle,
	className,
}: {
	lifecycle: Lifecycle;
	className?: string;
}) {
	// Running and scheduled share the info tone and sit next to each other in the
	// nav, so a scheduled retry is drawn hollow. The pulse still says "waiting on
	// a clock", but the ring is what survives prefers-reduced-motion, which
	// flattens every animation to 0.01ms.
	const waiting = lifecycle === "scheduled";
	return (
		<span
			aria-hidden="true"
			className={cn(
				"size-2 shrink-0 rounded-full",
				waiting
					? "animate-pulse bg-transparent ring-2 ring-info ring-inset"
					: lifecycleDotClass(lifecycle),
				className,
			)}
		/>
	);
}

export function LifecycleChip({ lifecycle }: { lifecycle: Lifecycle }) {
	return (
		<Badge variant={LIFECYCLE_VARIANTS[lifecycle]}>
			{LIFECYCLE_LABELS[lifecycle]()}
		</Badge>
	);
}

export function minutesFromMs(ms: number): number {
	return Math.max(1, Math.ceil(ms / 60_000));
}

export function providerRecordUrl(
	templates: Record<string, string> | undefined,
	provider: string | undefined,
	providerId: string | null | undefined,
): string | undefined {
	if (!templates || !provider || !providerId) return undefined;
	const template = templates[provider];
	return template?.replace("{id}", encodeURIComponent(providerId));
}

// Why the pipeline confirmed this match, strongest evidence first. A hard
// identifier needs no second look; a title-similarity bridge is exactly what a
// reviewer should be checking, so it reads as a warning.
const MATCH_REASONS: {
	reason: string;
	label: () => string;
	variant: "success" | "secondary" | "warning";
}[] = [
	{
		reason: "identifier.match",
		label: () => m["enrichment.reason_identifier"](),
		variant: "success",
	},
	{
		reason: "audiobook.asin_match",
		label: () => m["enrichment.reason_identifier"](),
		variant: "success",
	},
	{
		reason: "embedded_uid.match",
		label: () => m["enrichment.reason_embedded_uid"](),
		variant: "success",
	},
	{
		reason: "title.equivalent",
		label: () => m["enrichment.reason_title_exact"](),
		variant: "secondary",
	},
	{
		reason: "author.match",
		label: () => m["enrichment.reason_author"](),
		variant: "secondary",
	},
	{
		reason: "title.match",
		label: () => m["enrichment.reason_title_similar"](),
		variant: "warning",
	},
];

export function MatchReasonChip({ reasons }: { reasons: string[] }) {
	const strongest = MATCH_REASONS.find((entry) =>
		reasons.includes(entry.reason),
	);
	if (!strongest) return null;
	return (
		<Badge variant={strongest.variant} className="shrink-0">
			{strongest.label()}
		</Badge>
	);
}

export function sourceLabel(
	source: string,
	providerLabels: Record<string, string>,
): string {
	if (source === "local") return m["enrichment.source_local"]();
	if (source === "user") return m["enrichment.source_user"]();
	return providerLabels[source] ?? source;
}

export function failureLabel(code: string): string {
	switch (code) {
		case "provider_cooldown":
		case "rate_limited":
			return m["enrichment.failure_rate_limited"]();
		case "provider_unavailable":
		case "network_error":
		case "timeout":
		case "server_error":
			return m["enrichment.failure_temporarily_unavailable"]();
		default:
			return m["enrichment.failure_generic"]();
	}
}
