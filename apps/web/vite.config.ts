import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
	plugins: [
		// Compiles ./messages/{locale}.json into ./src/paraglide on dev/build.
		// Locale comes from the `locale` cookie (no URL prefix), resolved per
		// request on the server via paraglideMiddleware in src/server.ts.
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			outputStructure:
				command === "serve" ? "locale-modules" : "message-modules",
			strategy: ["cookie", "preferredLanguage", "baseLocale"],
			cookieName: "locale",
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
	resolve: {
		tsconfigPaths: true,
		// Keep a single React runtime even when a package manager hoists peers
		// differently across this workspace.
		dedupe: ["react", "react-dom", "use-sync-external-store"],
	},
	optimizeDeps: {
		// Lazy routes otherwise discover these after startup, forcing a reload
		// and briefly mixing old/new React bundles while navigation is in flight.
		include: [
			"@base-ui/react/checkbox",
			"@base-ui/react/context-menu",
			"@base-ui/react/switch",
			"@base-ui/react/tabs",
			"@base-ui/react/toggle",
			"@base-ui/react/toggle-group",
		],
	},
	ssr: {
		noExternal: ["@better-auth/core", "better-auth"],
	},
	server: {
		port: 3001,
	},
}));
