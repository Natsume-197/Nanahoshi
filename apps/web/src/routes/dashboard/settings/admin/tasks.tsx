import { createFileRoute } from "@tanstack/react-router";
import { AdminTasks } from "@/components/settings/sections/tasks";

export const Route = createFileRoute("/dashboard/settings/admin/tasks")({
	component: AdminTasks,
});
