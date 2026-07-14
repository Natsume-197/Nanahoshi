import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { getOrganizations } from "@/functions/get-organizations";

export const Route = createFileRoute("/dashboard")({
	beforeLoad: async () => ({ organizations: await getOrganizations() }),
	component: DashboardLayout,
});
