import { createPluginRegistration } from "@embedpdf/core";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import { PanPluginPackage } from "@embedpdf/plugin-pan/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { RotatePluginPackage } from "@embedpdf/plugin-rotate/react";
import {
	ScrollPluginPackage,
	ScrollStrategy,
} from "@embedpdf/plugin-scroll/react";
import { SearchPluginPackage } from "@embedpdf/plugin-search/react";
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react";
import { SpreadMode, SpreadPluginPackage } from "@embedpdf/plugin-spread/react";
import { TilingPluginPackage } from "@embedpdf/plugin-tiling/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ZoomMode, ZoomPluginPackage } from "@embedpdf/plugin-zoom/react";
import type { PdfReaderSource } from "@/lib/reader/pdf-source";

interface PdfReaderConfigOptions {
	wasmUrl: string;
	baseUrl?: string;
	source: Pick<PdfReaderSource, "name" | "url">;
}

export function createPdfReaderConfig({
	wasmUrl,
	baseUrl,
	source,
}: PdfReaderConfigOptions) {
	return {
		engine: {
			wasmUrl: baseUrl ? new URL(wasmUrl, baseUrl).href : wasmUrl,
			worker: true,
			encoderPoolSize: 2,
			fontFallback: null,
		},
		plugins: [
			createPluginRegistration(DocumentManagerPluginPackage, {
				maxDocuments: 1,
				initialDocuments: [
					{
						url: source.url,
						name: source.name,
						documentId: "nanahoshi-reader-pdf",
						mode: "range-request" as const,
						requestOptions: { credentials: "include" as const },
					},
				],
			}),
			createPluginRegistration(ViewportPluginPackage, { viewportGap: 16 }),
			createPluginRegistration(ScrollPluginPackage, {
				defaultStrategy: ScrollStrategy.Vertical,
				defaultPageGap: 16,
				defaultBufferSize: 4,
			}),
			createPluginRegistration(InteractionManagerPluginPackage),
			createPluginRegistration(ZoomPluginPackage, {
				defaultZoomLevel: ZoomMode.FitPage,
				minZoom: 0.25,
				maxZoom: 4,
			}),
			createPluginRegistration(PanPluginPackage, { defaultMode: "mobile" }),
			createPluginRegistration(SpreadPluginPackage, {
				defaultSpreadMode: SpreadMode.None,
			}),
			createPluginRegistration(RotatePluginPackage),
			createPluginRegistration(RenderPluginPackage, {
				defaultImageType: "image/png",
			}),
			createPluginRegistration(TilingPluginPackage, {
				tileSize: 768,
				overlapPx: 2.5,
				extraRings: 0,
				defaultImageType: "image/png",
			}),
			createPluginRegistration(SelectionPluginPackage),
			createPluginRegistration(SearchPluginPackage, {
				showAllResults: true,
			}),
		],
	};
}
