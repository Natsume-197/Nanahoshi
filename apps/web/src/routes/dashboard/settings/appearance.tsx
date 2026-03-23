import { createFileRoute } from "@tanstack/react-router";
import { ThemeOptions } from "@/components/shared/theme-toggle";
import { useTheme } from "@/hooks/use-theme";

export const Route = createFileRoute("/dashboard/settings/appearance")({
	component: AppearanceSettings,
});

function AppearanceSettings() {
	const { theme, setTheme } = useTheme();

	return (
		<div className="space-y-8">
			<div>
				<h2 className="font-bold text-2xl tracking-tight">Appearance</h2>
				<p className="text-muted-foreground text-sm">
					Choose how Nanahoshi looks to you.
				</p>
			</div>

			<section>
				<h3 className="mb-1 font-semibold text-lg">Theme</h3>
				<p className="mb-4 text-muted-foreground text-sm">
					Select your preferred color mode.
				</p>
				<div className="flex max-w-xs flex-col gap-1">
					<ThemeOptions value={theme} onChange={setTheme} />
				</div>
			</section>
		</div>
	);
}
