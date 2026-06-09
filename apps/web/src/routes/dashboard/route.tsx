import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getSidebarState } from "@/functions/get-sidebar-state";

export const Route = createFileRoute("/dashboard")({
	loader: async () => {
		const sidebarOpen = await getSidebarState();
		return { sidebarOpen };
	},
	component: DashboardRoute,
});

function DashboardRoute() {
	const { sidebarOpen } = Route.useLoaderData();
	return <DashboardLayout defaultSidebarOpen={sidebarOpen} />;
}
