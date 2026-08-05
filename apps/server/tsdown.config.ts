import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["./src/index.ts", "./src/worker.ts"],
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
		alwaysBundle: [/@nanahoshi-v2\/.*/],
	},
});
