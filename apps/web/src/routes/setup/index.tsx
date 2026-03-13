import { createFileRoute, redirect } from "@tanstack/react-router";
import { CreateWorkspaceForm } from "@/components/forms/create-workspace-form";
import { LogoIcon } from "@/components/shared/logo";
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
		<div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4">
			<div className="mx-auto space-y-6 sm:w-lg">
				<div className="flex justify-center">
					<LogoIcon className="size-10 text-primary" />
				</div>
				<CreateWorkspaceForm />
			</div>
		</div>
	);
}
