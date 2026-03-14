import { useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardHomeContent } from "@/components/dashboard/home/dashboard-home-content";
import { orpc } from "@/utils/orpc";

const DASHBOARD_LIMIT = 15;

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
			orpc.books.listRandom.queryOptions({ input: { limit: DASHBOARD_LIMIT } }),
		);
	},
});

function DashboardHome() {
	const recentBooksQuery = useQuery(
		orpc.books.listRecent.queryOptions({ input: { limit: DASHBOARD_LIMIT } }),
	);
	const recentlyReadBooksQuery = useQuery(
		orpc.readingProgress.listInProgress.queryOptions({
			input: { limit: DASHBOARD_LIMIT },
		}),
	);
	const randomBooksQuery = useQuery(
		orpc.books.listRandom.queryOptions({ input: { limit: DASHBOARD_LIMIT } }),
	);

	const isLoading =
		recentBooksQuery.isLoading ||
		recentlyReadBooksQuery.isLoading ||
		randomBooksQuery.isLoading;

	return (
		<DashboardHomeContent
			isLoading={isLoading}
			recentBooks={recentBooksQuery.data ?? []}
			recentlyReadBooks={recentlyReadBooksQuery.data ?? []}
			initialRandomBooks={randomBooksQuery.data ?? []}
		/>
	);
}
