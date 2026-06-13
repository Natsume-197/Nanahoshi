import { createFileRoute } from "@tanstack/react-router";
import { AdminSystem } from "@/components/settings/sections/system";

export const Route = createFileRoute("/dashboard/settings/admin/system")({
	component: AdminSystem,
});
