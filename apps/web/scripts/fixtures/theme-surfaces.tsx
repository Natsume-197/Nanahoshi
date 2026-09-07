import { Palette } from "@phosphor-icons/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { DashboardHeaderSearch } from "@/components/dashboard/dashboard-header-search";
import { SettingsDialogShell } from "@/components/settings/settings-dialog-shell";
import { CategorySelector } from "@/components/shared/category-selector";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	applyPaletteVars,
	DEFAULT_GRADIENT_INPUT,
	previewCustomVars,
	previewGradientVars,
	previewSeedVars,
} from "@/lib/theme-palettes";
import { setLocale } from "@/paraglide/runtime";
import { topSearchQueryOptions } from "@/utils/top-search";
import "../../src/index.css";

const params = new URLSearchParams(location.search);
const base = params.get("base") === "light" ? "light" : "dark";
const color = params.get("color") ?? "#a855f7";
const kind = params.get("kind") ?? "gradient";
document.documentElement.classList.toggle("dark", base === "dark");
applyPaletteVars(
	kind === "seed"
		? previewSeedVars({ base, seed: color })
		: kind === "custom"
			? previewCustomVars({
					base,
					background: base === "dark" ? "#1c1726" : "#faf5ff",
					card: base === "dark" ? "#302340" : "#f3e8ff",
					primary: color,
				})
			: previewGradientVars({
					...DEFAULT_GRADIENT_INPUT[base],
					intensity: 70,
					stops: [
						{ id: "first", color },
						{ id: "second", color: "#f97316" },
					],
				}),
);
setLocale("es", { reload: false });
localStorage.setItem(
	"nanahoshi:recent-searches",
	JSON.stringify(["Libro de prueba"]),
);
const queryClient = new QueryClient();
queryClient.setQueryData(topSearchQueryOptions("Libro").queryKey, {
	hits: [
		{
			type: "book",
			uuid: "fixture",
			filename: "fixture.epub",
			title: "Libro de prueba",
			authors: [],
			cover: null,
		},
	],
});
function Surfaces() {
	const [settings, setSettings] = useState(false);
	const [category, setCategory] = useState("home");
	return (
		<main className="theme-gradient-surface min-h-screen bg-background p-8">
			<CategorySelector
				value={category}
				onValueChange={setCategory}
				ariaLabel="Categorías"
				items={[
					{ value: "home", label: () => "Inicio" },
					{ value: "books", label: () => "Libros" },
					{ value: "audiobooks", label: () => "Audiolibros" },
				]}
			/>
			<div className="relative my-8 h-16">
				<DashboardHeaderSearch />
			</div>
			<DropdownMenu>
				<DropdownMenuTrigger>Menú de prueba</DropdownMenuTrigger>
				<DropdownMenuContent>
					<DropdownMenuItem>Elemento de prueba</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<button type="button" onClick={() => setSettings(true)}>
				Abrir ajustes
			</button>
			{settings && (
				<SettingsDialogShell
					title="Ajustes"
					closeLabel="Cerrar ajustes"
					groups={[
						{
							label: "Preferencias",
							items: [
								{ key: "appearance", label: "Apariencia", icon: Palette },
							],
						},
					]}
					activeKey="appearance"
					onNavigate={() => {}}
					onClose={() => setSettings(false)}
				>
					<p>Contenido de ajustes</p>
				</SettingsDialogShell>
			)}
		</main>
	);
}
const rootRoute = createRootRoute({ component: Surfaces });
const router = createRouter({
	routeTree: rootRoute,
	history: createMemoryHistory({ initialEntries: ["/"] }),
});
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(
	<QueryClientProvider client={queryClient}>
		<RouterProvider router={router} />
	</QueryClientProvider>,
);
