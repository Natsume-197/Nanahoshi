import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardHomeContent } from "@/components/dashboard/home/dashboard-home-content";
import { DASHBOARD_LIMIT } from "@/components/dashboard/home/section-skeleton";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardHome,
	beforeLoad: function beforeLoad({ context }) {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	loader: ({ context }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(
			orpc.books.listRecent.queryOptions({ input: { limit: DASHBOARD_LIMIT } }),
		);
		context.queryClient.prefetchQuery(
			orpc.readingProgress.listInProgress.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.listeningProgress.listInProgress.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.audiobooks.listRecent.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.series.list.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);
		context.queryClient.prefetchQuery(
			orpc.audiobooks.listSeries.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
		);
		context.queryClient.prefetchQuery({
			...orpc.books.listRandom.queryOptions({
				input: { limit: DASHBOARD_LIMIT },
			}),
			staleTime: Number.POSITIVE_INFINITY,
		});
	},
});

function DashboardHome() {
	return <DashboardHomeContent />;
}
