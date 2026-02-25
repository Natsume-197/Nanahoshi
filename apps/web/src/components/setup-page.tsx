// https://magicui.design/docs/components/particles
import { Particles } from "@/components/ui/particles";
import { CreateWorkspaceForm } from "@/components/forms/create-workspace-form";

export function SetupPage() {
	return (
		<div className="relative w-full md:h-screen md:overflow-hidden">
			<Particles
				className="absolute inset-0"
				color="#666666"
				ease={50}
				quantity={120}
			/>
			<div className="relative mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-4">
				<div className="mx-auto space-y-4 sm:w-lg">

					<div className="space-y-2">
						<CreateWorkspaceForm />
					</div>
				</div>
			</div>
		</div>
	);
}

