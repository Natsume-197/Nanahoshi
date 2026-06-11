import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import {
	isSettingsSection,
	type SettingsSection,
} from "@/components/settings/settings-sections";
import { getSidebarState } from "@/functions/get-sidebar-state";

export const Route = createFileRoute("/dashboard")({
	// `settings` opens the settings window as an overlay on top of whatever
	// dashboard page is currently shown (Discord-style), without unmounting it.
	validateSearch: (
		search: Record<string, unknown>,
	): { settings?: SettingsSection } =>
		isSettingsSection(search.settings) ? { settings: search.settings } : {},
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
