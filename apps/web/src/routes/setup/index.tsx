import { createFileRoute, redirect } from "@tanstack/react-router";
import { CreateWorkspaceForm } from "@/components/forms/create-workspace-form";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/setup/")({
	beforeLoad: async () => {
		const isConfigured = await client.setup.isConfigured();
		if (isConfigured) {
			throw redirect({
				to: "/dashboard",
			});
		}
	},
	component: SetupRoutePage,
});

function SetupRoutePage() {
	return (
		<main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
			<CreateWorkspaceForm />
		</main>
	);
}
