import { defineConfig } from "tsdown";

export default defineConfig({
	entry: {
		index: "./src/index.ts",
		worker: "./src/worker.ts",
		// The updater sidecar runs this from the same image (docker-compose.yml).
		updater: "./src/updater/main.ts",
	},
	format: "esm",
	outDir: "./dist",
	clean: true,
	dts: false,
	copy: {
		from: "../../packages/ebook-parser/node_modules/7z-wasm/7zz.wasm",
		to: "dist",
		rename: "7zz.wasm",
	},
	deps: {
		alwaysBundle: [/@nanahoshi\/.*/],
	},
});
