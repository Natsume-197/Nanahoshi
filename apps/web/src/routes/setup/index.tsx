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
		<main className="flex min-h-dvh items-center justify-center bg-background ps-[max(1rem,var(--safe-area-left))] pe-[max(1rem,var(--safe-area-right))] pt-[max(3rem,calc(var(--safe-area-top)+1rem))] pb-[max(3rem,calc(var(--safe-area-bottom)+1rem))]">
			<CreateWorkspaceForm />
		</main>
	);
}
