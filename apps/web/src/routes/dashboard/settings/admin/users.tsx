import { createFileRoute } from "@tanstack/react-router";
import { AdminUsers } from "@/components/settings/sections/users";

export const Route = createFileRoute("/dashboard/settings/admin/users")({
	component: AdminUsers,
});
