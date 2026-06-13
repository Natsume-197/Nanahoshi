import { createFileRoute } from "@tanstack/react-router";
import { AdminOrganizations } from "@/components/settings/sections/organizations";

export const Route = createFileRoute(
	"/dashboard/settings/admin/organizations/",
)({
	component: AdminOrganizations,
});
