import { createFileRoute } from "@tanstack/react-router";
import { LibrariesSettings } from "@/components/settings/sections/libraries";

export const Route = createFileRoute(
	"/dashboard/settings/organization/libraries",
)({
	component: LibrariesSettings,
});
