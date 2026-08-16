import { createPluginRegistration } from "@embedpdf/core";
import {
	AnnotationPluginPackage,
	LockModeType,
} from "@embedpdf/plugin-annotation/react";
import { DocumentManagerPluginPackage } from "@embedpdf/plugin-document-manager/react";
import { ExportPluginPackage } from "@embedpdf/plugin-export/react";
import { FormPluginPackage } from "@embedpdf/plugin-form/react";
import { HistoryPluginPackage } from "@embedpdf/plugin-history/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager/react";
import { PanPluginPackage } from "@embedpdf/plugin-pan/react";
import { PrintPluginPackage } from "@embedpdf/plugin-print/react";
import { RenderPluginPackage } from "@embedpdf/plugin-render/react";
import { RotatePluginPackage } from "@embedpdf/plugin-rotate/react";
import {
	ScrollPluginPackage,
	ScrollStrategy,
} from "@embedpdf/plugin-scroll/react";
import { SearchPluginPackage } from "@embedpdf/plugin-search/react";
import { SelectionPluginPackage } from "@embedpdf/plugin-selection/react";
import { SpreadMode, SpreadPluginPackage } from "@embedpdf/plugin-spread/react";
import { ThumbnailPluginPackage } from "@embedpdf/plugin-thumbnail/react";
import { TilingPluginPackage } from "@embedpdf/plugin-tiling/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport/react";
import { ZoomMode, ZoomPluginPackage } from "@embedpdf/plugin-zoom/react";
import type { PdfReaderSource } from "@/features/reader/document/pdf-source";

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
			// Keep pointer mode as the reading default. The official PanPlugin owns
			// hand dragging, cursor state, and the hand/pointer transition.
			createPluginRegistration(PanPluginPackage, { defaultMode: "never" }),
			createPluginRegistration(ZoomPluginPackage, {
				defaultZoomLevel: ZoomMode.FitPage,
				minZoom: 0.25,
				maxZoom: 4,
			}),
			createPluginRegistration(SpreadPluginPackage, {
				defaultSpreadMode: SpreadMode.None,
			}),
			createPluginRegistration(RotatePluginPackage),
			createPluginRegistration(RenderPluginPackage, {
				defaultImageType: "image/png",
			}),
			createPluginRegistration(ThumbnailPluginPackage, {
				width: 132,
				gap: 10,
				buffer: 4,
				autoScroll: true,
			}),
			createPluginRegistration(TilingPluginPackage, {
				tileSize: 768,
				overlapPx: 2.5,
				extraRings: 0,
				defaultImageType: "image/png",
			}),
			createPluginRegistration(SelectionPluginPackage),
			createPluginRegistration(HistoryPluginPackage),
			createPluginRegistration(AnnotationPluginPackage, {
				// Nanahoshi is a reader: display PDF links and annotations without
				// allowing accidental edits to the source document.
				locked: { type: LockModeType.All },
			}),
			createPluginRegistration(FormPluginPackage),
			createPluginRegistration(SearchPluginPackage, {
				showAllResults: true,
			}),
			createPluginRegistration(PrintPluginPackage),
			createPluginRegistration(ExportPluginPackage, {
				defaultFileName: source.name,
			}),
		],
	};
}
