import { createFileRoute } from "@tanstack/react-router";
import { ProfileSettings } from "@/components/settings/sections/profile";

export const Route = createFileRoute("/dashboard/settings/profile")({
	component: ProfileSettings,
});
