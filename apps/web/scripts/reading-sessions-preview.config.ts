import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
	plugins: [react(), tailwind()],
	resolve: {
		alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) },
		tsconfigPaths: true,
	},
	optimizeDeps: { entries: ["scripts/fixtures/reading-sessions.html"] },
	server: { port: 3017, host: "127.0.0.1" },
});
