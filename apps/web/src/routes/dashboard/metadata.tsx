import {
	createFileRoute,
	redirect,
	type SearchSchemaInput,
} from "@tanstack/react-router";
import { MatchManager } from "@/components/enrichment/match-manager";
import { optionalString } from "@/lib/search-validators";
import { orpc } from "@/utils/orpc";

const STATUS_VALUES = [
	"pending",
	"enriched",
	"partial",
	"no_match",
	"review",
	"all",
] as const;

type StatusSearch = (typeof STATUS_VALUES)[number];

export const Route = createFileRoute("/dashboard/metadata")({
	component: RouteComponent,
	validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
		status: STATUS_VALUES.includes(search.status as StatusSearch)
			? (search.status as StatusSearch)
			: undefined,
		library: optionalString(search.library),
	}),
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	loader: ({ context }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(
			orpc.enrichment.list.queryOptions({
				input: { status: "no_match", limit: 50, offset: 0 },
			}),
		);
	},
});

function RouteComponent() {
	const { status, library } = Route.useSearch();
	return (
		<MatchManager
			initialStatus={status}
			initialLibraryUuid={library ?? undefined}
		/>
	);
}
