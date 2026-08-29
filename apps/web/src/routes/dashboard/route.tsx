import { createFileRoute, redirect } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getOrganizations } from "@/functions/get-organizations";

export const Route = createFileRoute("/dashboard")({
	// beforeLoad re-runs on EVERY navigation inside the dashboard, so the org
	// list must come from the query cache — awaiting the server fn directly put
	// a blocking round-trip (twice: intent preload + the click's own run) in
	// front of every section change. The OrgSwitcher keeps its own better-auth
	// subscription for live updates; this only feeds the initial render.
	beforeLoad: async ({ context }) => {
		if (!context.session) throw redirect({ to: "/login" });
		if (typeof window === "undefined") {
			return {
				session: context.session,
				organizations: await getOrganizations(),
			};
		}
		const organizations = await context.queryClient.ensureQueryData({
			queryKey: ["organizations", "dashboard"],
			queryFn: () => getOrganizations(),
			staleTime: 5 * 60_000,
		});
		return { session: context.session, organizations };
	},
	component: DashboardLayout,
});
