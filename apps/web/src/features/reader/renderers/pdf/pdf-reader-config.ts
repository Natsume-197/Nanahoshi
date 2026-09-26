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
import {
	DEFAULT_PDF_VIEW,
	type PdfViewPreference,
	type PdfZoomPreference,
} from "./pdf-view-preferences";

interface PdfReaderConfigOptions {
	wasmUrl: string;
	baseUrl?: string;
	source: Pick<PdfReaderSource, "name" | "data">;
	/** The book's remembered view, applied before the first layout. */
	view?: PdfViewPreference;
}

export function createPdfReaderConfig({
	wasmUrl,
	baseUrl,
	source,
	view = DEFAULT_PDF_VIEW,
}: PdfReaderConfigOptions) {
	return {
		engine: {
			wasmUrl: baseUrl ? new URL(wasmUrl, baseUrl).href : wasmUrl,
			worker: true,
			// Pages render as raw bitmaps; only thumbnails and zoom tiles encode.
			encoderPoolSize: 1,
			fontFallback: null,
		},
		plugins: [
			createPluginRegistration(DocumentManagerPluginPackage, {
				maxDocuments: 1,
				initialDocuments: [
					{
						buffer: source.data,
						name: source.name,
						documentId: "nanahoshi-reader-pdf",
					},
				],
			}),
			createPluginRegistration(ViewportPluginPackage, { viewportGap: 16 }),
			createPluginRegistration(ScrollPluginPackage, {
				defaultStrategy:
					view.scrollDirection === "horizontal"
						? ScrollStrategy.Horizontal
						: ScrollStrategy.Vertical,
				defaultPageGap: 16,
				defaultBufferSize: 4,
			}),
			createPluginRegistration(InteractionManagerPluginPackage),
			// Keep pointer mode as the reading default. The official PanPlugin owns
			// hand dragging, cursor state, and the hand/pointer transition.
			createPluginRegistration(PanPluginPackage, { defaultMode: "never" }),
			createPluginRegistration(ZoomPluginPackage, {
				// Numeric defaults never release EmbedPDF's zoom gate; see PdfRememberedZoom.
				defaultZoomLevel:
					typeof view.zoom === "number"
						? ZoomMode.FitPage
						: zoomLevelFor(view.zoom),
				minZoom: 0.25,
				maxZoom: 4,
			}),
			createPluginRegistration(SpreadPluginPackage, {
				defaultSpreadMode:
					view.layout === "spread-even"
						? SpreadMode.Even
						: view.layout === "spread-odd"
							? SpreadMode.Odd
							: SpreadMode.None,
			}),
			createPluginRegistration(RotatePluginPackage, {
				defaultRotation: view.rotation,
			}),
			createPluginRegistration(RenderPluginPackage, {
				defaultImageType: "image/jpeg",
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
				defaultImageType: "image/jpeg",
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

export function zoomLevelFor(zoom: PdfZoomPreference) {
	if (typeof zoom === "number") return zoom;
	return zoom === "fit-width"
		? ZoomMode.FitWidth
		: zoom === "automatic"
			? ZoomMode.Automatic
			: ZoomMode.FitPage;
}
