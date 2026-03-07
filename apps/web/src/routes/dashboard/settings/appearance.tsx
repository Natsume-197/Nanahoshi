import { createFileRoute } from "@tanstack/react-router";
import { type Theme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/settings/appearance")({
	component: AppearanceSettings,
});

const themeOptions: {
	value: Theme;
	label: string;
	description: string;
	preview: { bg: string; sidebar: string; card: string; accent: string };
}[] = [
	{
		value: "dark",
		label: "Ember",
		description: "Warm dark with green accents",
		preview: {
			bg: "bg-[#302e24]",
			sidebar: "bg-[#3a3729]",
			card: "bg-[#282618]",
			accent: "bg-[#7cc55a]",
		},
	},
	{
		value: "spotify",
		label: "Spotify",
		description: "Deep black with vibrant green",
		preview: {
			bg: "bg-[#121212]",
			sidebar: "bg-[#000000]",
			card: "bg-[#181818]",
			accent: "bg-[#1db954]",
		},
	},
];

function AppearanceSettings() {
	const { theme, setTheme } = useTheme();

	return (
		<div className="space-y-8">
			<section>
				<h2 className="mb-1 font-semibold text-lg">Appearance</h2>
				<p className="mb-6 text-muted-foreground text-sm">
					Customize how the app looks on your device
				</p>

				<div className="space-y-3">
					<p className="font-medium text-sm">Theme</p>
					<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
						{themeOptions.map((option) => (
							<button
								key={option.value}
								type="button"
								onClick={() => setTheme(option.value)}
								className={cn(
									"group flex flex-col items-start gap-2.5 rounded-lg p-2 text-left transition-all",
									theme === option.value
										? "ring-2 ring-primary ring-offset-2 ring-offset-background"
										: "ring-1 ring-border hover:ring-border/80",
								)}
							>
								{/* Preview mockup */}
								<div
									className={cn(
										"flex h-20 w-full overflow-hidden rounded-md sm:h-24",
										option.preview.bg,
									)}
								>
									{/* Sidebar */}
									<div
										className={cn(
											"w-1/4 border-white/5 border-r",
											option.preview.sidebar,
										)}
									>
										<div className="space-y-1 p-1.5 pt-2.5">
											<div
												className={cn(
													"h-1 w-3/4 rounded-full opacity-50",
													option.preview.accent,
												)}
											/>
											<div
												className={cn(
													"h-1 w-1/2 rounded-full opacity-25",
													option.preview.accent,
												)}
											/>
											<div
												className={cn(
													"h-1 w-2/3 rounded-full opacity-25",
													option.preview.accent,
												)}
											/>
										</div>
									</div>
									{/* Content */}
									<div className="flex-1 p-2">
										<div
											className={cn(
												"h-3 w-3/4 rounded-sm opacity-60",
												option.preview.card,
											)}
										/>
										<div className="mt-1.5 flex gap-1">
											<div
												className={cn(
													"h-6 flex-1 rounded-sm",
													option.preview.card,
												)}
											/>
											<div
												className={cn(
													"h-6 flex-1 rounded-sm",
													option.preview.card,
												)}
											/>
										</div>
									</div>
								</div>

								{/* Label */}
								<div className="px-0.5">
									<p
										className={cn(
											"font-medium text-sm",
											theme === option.value
												? "text-foreground"
												: "text-muted-foreground",
										)}
									>
										{option.label}
									</p>
									<p className="text-muted-foreground text-xs">
										{option.description}
									</p>
								</div>
							</button>
						))}
					</div>
				</div>
			</section>
		</div>
	);
}
