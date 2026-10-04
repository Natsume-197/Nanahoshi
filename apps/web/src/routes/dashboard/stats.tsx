import type { StatsView } from "@nanahoshi/reader/sessions/stats-model";
import { StatsPage } from "@nanahoshi/reader/stats/stats-page";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { PAGE_SHELL } from "@/lib/page-layout";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/dashboard/stats")({
	component: StatsRoute,
	validateSearch: (search: Record<string, unknown>) => ({
		view:
			search.view === "reading" || search.view === "listening"
				? (search.view as StatsView)
				: undefined,
	}),
	head: () => ({
		meta: [{ title: `${m["nav.stats"]()} · Nanahoshi` }],
	}),
	beforeLoad: ({ context }) => {
		if (!context.session) throw redirect({ to: "/login" });
	},
});

function StatsRoute() {
	const { view } = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<StatsPage
			className={PAGE_SHELL}
			view={view ?? "all"}
			onViewChange={(next) =>
				navigate({
					search: { view: next === "all" ? undefined : next },
					replace: true,
				})
			}
		/>
	);
}
