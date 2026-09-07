import { createRoot } from "react-dom/client";
import { AppearanceSettings } from "@/components/settings/sections/appearance";
import { applyStoredTheme } from "@/hooks/use-theme";
import { setLocale } from "@/paraglide/runtime";
import "../../src/index.css";

setLocale("es", { reload: false });
applyStoredTheme();
const root = document.getElementById("root");
if (!root) throw new Error("Missing preview root");
createRoot(root).render(
	<main className="mx-auto max-w-4xl p-5 sm:p-10">
		<AppearanceSettings />
	</main>,
);
