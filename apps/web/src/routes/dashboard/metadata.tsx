import {
	createFileRoute,
	redirect,
	type SearchSchemaInput,
} from "@tanstack/react-router";
import {
	type EnrichmentSort,
	listInputFromSearch,
} from "@/components/enrichment/filters";
import { MatchManager } from "@/components/enrichment/match-manager";
import { optionalString } from "@/lib/search-validators";
import { orpc } from "@/utils/orpc";

const BUCKET_VALUES = ["all", "in_progress", "attention", "completed"] as const;
const TYPE_VALUES = ["ebook", "audiobook"] as const;
const PAIR_VIEW_VALUES = [
	"no_alignment",
	"failed",
	"unmatched",
	"generating",
	"ready",
] as const;
const LIFECYCLE_VALUES = [
	"scheduled",
	"review",
	"unresolved",
	"no_match",
	"partial",
	"failed",
	"running",
	"done",
] as const;

function oneOf<T extends readonly string[]>(
	values: T,
	raw: unknown,
): T[number] | undefined {
	return values.includes(raw as T[number]) ? (raw as T[number]) : undefined;
}

function positiveInteger(raw: unknown): number | undefined {
	const value = Number(raw);
	return Number.isInteger(value) && value > 1 ? value : undefined;
}

function enrichmentSort(raw: unknown): EnrichmentSort | undefined {
	if (raw === "recent") return "updated.desc";
	if (raw === "oldest") return "updated.asc";
	if (raw === "title") return "title.asc";
	if (typeof raw !== "string") return undefined;
	const entries = raw.split(",");
	return entries.length <= 2 &&
		entries.every((entry) => /^(title|updated)\.(asc|desc)$/.test(entry))
		? (raw as EnrichmentSort)
		: undefined;
}

export const Route = createFileRoute("/dashboard/metadata")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
		bucket: oneOf(BUCKET_VALUES, search.bucket),
		lifecycle: oneOf(LIFECYCLE_VALUES, search.lifecycle),
		library: optionalString(search.library),
		type: oneOf(TYPE_VALUES, search.type),
		sort: enrichmentSort(search.sort),
		failures: search.failures === true ? true : undefined,
		q: optionalString(search.q),
		page: positiveInteger(search.page),
		// Read & Listen pairing review lives in this tray as its own section.
		view: search.view === "pairings" ? ("pairings" as const) : undefined,
		pairs: oneOf(PAIR_VIEW_VALUES, search.pairs),
	}),
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	// Prefetch the exact page the component will ask for, so a deep link (e.g.
	// the notification bell's "attention" link) warms the right entry.
	loaderDeps: ({ search }) => search,
	loader: ({ context, deps }) => {
		if (typeof window === "undefined" || deps.view === "pairings") return;
		context.queryClient.prefetchQuery(
			orpc.enrichment.list.queryOptions({ input: listInputFromSearch(deps) }),
		);
	},
});

function RouteComponent() {
	return <MatchManager />;
}
