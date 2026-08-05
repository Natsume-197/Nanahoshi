import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		// Compiles ./messages/{locale}.json into ./src/paraglide on dev/build.
		// Locale comes from the `locale` cookie (no URL prefix), resolved per
		// request on the server via paraglideMiddleware in src/server.ts.
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			outputStructure: "message-modules",
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
	ssr: {
		noExternal: ["@better-auth/core", "better-auth"],
	},
	server: {
		port: 3001,
	},
});
