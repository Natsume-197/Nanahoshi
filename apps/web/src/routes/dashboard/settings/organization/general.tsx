import { createFileRoute } from "@tanstack/react-router";
import { OrganizationGeneral } from "@/components/settings/sections/general";

export const Route = createFileRoute(
	"/dashboard/settings/organization/general",
)({
	component: OrganizationGeneral,
});
