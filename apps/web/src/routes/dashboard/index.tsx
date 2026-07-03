import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardHomeContent } from "@/components/dashboard/home/dashboard-home-content";
import { DASHBOARD_LIMIT } from "@/components/dashboard/home/section-skeleton";
import { continueReadingQueryOptions } from "@/hooks/books/continue-reading-query";
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
	loader: async ({ context }) => {
		if (typeof window === "undefined") return;
		// Await the two in-progress lists so the resume hero — and the color wash
		// it hands the navbar — paint on first render instead of popping in a beat
		// after the page loads. The rest of the rows stream in via prefetch.
		await Promise.all([
			context.queryClient.ensureQueryData(continueReadingQueryOptions()),
			context.queryClient.ensureQueryData(
				orpc.listeningProgress.listInProgress.queryOptions({
					input: { limit: DASHBOARD_LIMIT },
				}),
			),
		]);
		context.queryClient.prefetchQuery(
			orpc.books.listRecent.queryOptions({ input: { limit: DASHBOARD_LIMIT } }),
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
