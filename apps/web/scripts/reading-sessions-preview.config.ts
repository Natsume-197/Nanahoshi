import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
export default defineConfig({
	plugins: [react(), tailwind()],
	resolve: { tsconfigPaths: true },
	server: { port: 3017, host: "127.0.0.1" },
});
