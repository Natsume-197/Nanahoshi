import {
	createFileRoute,
	redirect,
	type SearchSchemaInput,
} from "@tanstack/react-router";
import { listInputFromSearch } from "@/components/enrichment/filters";
import { MatchManager } from "@/components/enrichment/match-manager";
import { optionalString } from "@/lib/search-validators";
import { orpc } from "@/utils/orpc";

const BUCKET_VALUES = [
	"all",
	"in_progress",
	"attention",
	"stopped",
	"completed",
	"history",
] as const;
const TYPE_VALUES = ["ebook", "audiobook"] as const;
const SORT_VALUES = ["recent", "oldest", "title"] as const;
const LIFECYCLE_VALUES = [
	"archived",
	"stopped",
	"scheduled",
	"review",
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

export const Route = createFileRoute("/dashboard/metadata")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
		bucket: oneOf(BUCKET_VALUES, search.bucket),
		lifecycle: oneOf(LIFECYCLE_VALUES, search.lifecycle),
		library: optionalString(search.library),
		type: oneOf(TYPE_VALUES, search.type),
		sort: oneOf(SORT_VALUES, search.sort),
		failures: search.failures === true ? true : undefined,
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
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(
			orpc.enrichment.list.queryOptions({ input: listInputFromSearch(deps) }),
		);
	},
});

function RouteComponent() {
	return <MatchManager />;
}
