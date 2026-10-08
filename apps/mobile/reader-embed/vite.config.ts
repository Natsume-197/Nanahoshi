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

// Fonts and wasm stay files beside the page (the app copies them next to it):
// inlined as base64 they made an 18 MB page that every launch parsed, though
// a page only reads a font when it draws with it and wasm when a PDF or a
// comic opens. Runs after singlefile, which inlines everything by default.
function keepBinariesAsFiles(): Plugin {
	return {
		name: "keep-binaries-as-files",
		enforce: "post",
		config(config) {
			config.build ??= {};
			config.build.assetsInlineLimit = (file) => !/\.(woff2?|wasm)$/.test(file);
		},
	};
}

// One HTML with its scripts and styles inlined, opened from file:// by the
// mobile app, plus the fonts and wasm it loads by relative URL.
export default defineConfig({
	plugins: [
		dropWoffFallbacks(),
		dropPdfiumDefaultWasm(),
		tailwindcss(),
		viteReact(),
		viteSingleFile(),
		keepBinariesAsFiles(),
	],
	build: {
		target: "es2022",
	},
	resolve: {
		dedupe: ["react", "react-dom", "use-sync-external-store"],
	},
});
