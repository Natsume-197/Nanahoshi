import { createFileRoute } from "@tanstack/react-router";
import { AccountSettings } from "@/components/settings/sections/account";

export const Route = createFileRoute("/dashboard/settings/account")({
	component: AccountSettings,
});
