import { createFileRoute } from "@tanstack/react-router";
import { MembersSettings } from "@/components/settings/sections/members";

export const Route = createFileRoute(
	"/dashboard/settings/organization/members",
)({
	component: MembersSettings,
});
