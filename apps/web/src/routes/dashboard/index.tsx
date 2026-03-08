import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardHomeContent } from "@/components/dashboard/home/dashboard-home-content";
import {
	getRandomBooks,
	getRecentBooks,
	getRecentlyReadBooks,
} from "@/functions/books/get-recent-books";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/dashboard/")({
	component: DashboardHome,
	staleTime: 30 * 60_000,
	preloadStaleTime: 30 * 60_000,
	beforeLoad: async function beforeLoad() {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	loader: async function loader() {
		const [recentBooks, recentlyReadBooks, randomBooks] = await Promise.all([
			getRecentBooks(),
			getRecentlyReadBooks(),
			getRandomBooks(),
		]);
		return { recentBooks, recentlyReadBooks, randomBooks };
	},
});

function DashboardHome() {
	const { session } = Route.useRouteContext();
	const { recentBooks, recentlyReadBooks, randomBooks } = Route.useLoaderData();
	return (
		<DashboardHomeContent
			userName={session.user.name}
			recommendationScope={`${session.user.id}:${session.session.activeOrganizationId ?? "no-org"}`}
			recentBooks={recentBooks ?? []}
			recentlyReadBooks={recentlyReadBooks ?? []}
			initialRandomBooks={randomBooks ?? []}
		/>
	);
}
