import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Every WebView reads woff2; the woff fallbacks would double the inlined fonts.
function dropWoffFallbacks(): Plugin {
	return {
		name: "drop-woff-fallbacks",
		enforce: "pre",
		transform(code, id) {
			if (!id.includes("@fontsource") || !id.endsWith(".css")) return;
			return code.replace(
				/,\s*url\([^)]+\.woff\)\s*format\(['"]woff['"]\)/g,
				"",
			);
		},
	};
}

// The engine always receives the reader's pdfium.wasm bytes (wasmBinary), so
// pdfium's own new URL() fallback is dead code that would inline a second copy.
function dropPdfiumDefaultWasm(): Plugin {
	return {
		name: "drop-pdfium-default-wasm",
		enforce: "pre",
		transform(code, id) {
			if (!id.includes("@embedpdf/pdfium") || !id.endsWith(".js")) return;
			return code.replace(
				"new URL('pdfium.wasm', import.meta.url).href",
				"'pdfium.wasm'",
			);
		},
	};
}

// One self-contained HTML the mobile app ships and opens from file://, where
// the page can fetch nothing: scripts, styles, fonts and wasm are all inlined.
export default defineConfig({
	plugins: [
		dropWoffFallbacks(),
		dropPdfiumDefaultWasm(),
		tailwindcss(),
		viteReact(),
		viteSingleFile(),
	],
	build: {
		assetsInlineLimit: Number.MAX_SAFE_INTEGER,
		target: "es2022",
	},
	resolve: {
		dedupe: ["react", "react-dom", "use-sync-external-store"],
	},
});
