import { usePan } from "@embedpdf/plugin-pan/react";
import { useRotate } from "@embedpdf/plugin-rotate/react";
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react";
import {
	ArrowClockwise,
	Columns,
	File,
	Hand,
	Minus,
	Plus,
	Rows,
} from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ReaderTheme } from "@/lib/reader/settings";
import type { PdfLayoutMode } from "./pdf-view-state";
import { readerMix } from "./reader-controls";

interface PdfNavigationToolbarProps {
	documentId: string;
	theme: ReaderTheme;
	layout: PdfLayoutMode;
	pageNumber: number;
	pageCount: number;
	onLayoutChange: (layout: PdfLayoutMode) => void;
}

export function PdfNavigationToolbar({
	documentId,
	theme,
	layout,
	pageNumber,
	pageCount,
	onLayoutChange,
}: PdfNavigationToolbarProps) {
	const { state: zoomState, provides: zoom } = useZoom(documentId);
	const { rotation, provides: rotate } = useRotate(documentId);
	const { isPanning, provides: pan } = usePan(documentId);
	const zoomPercent = Math.round(zoomState.currentZoomLevel * 100);
	return (
		<nav
			aria-label="PDF view controls"
			className="nanahoshi-pdf-toolbar fixed bottom-[max(3.25rem,var(--safe-area-bottom))] left-1/2 flex max-w-[calc(100dvw-1rem)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-3xl p-1.5 shadow-xl max-[30rem]:w-[calc(100dvw-1rem)] max-[30rem]:flex-wrap max-[30rem]:justify-center"
			style={
				{
					color: theme.fontColor,
					backgroundColor: theme.backgroundColor,
					border: `1px solid ${readerMix(theme, 15)}`,
					"--pdf-toolbar-hover": readerMix(theme, 8),
				} as CSSProperties
			}
		>
			<fieldset className="m-0 flex min-w-0 shrink-0 items-center gap-0.5 rounded-2xl border-0 bg-[var(--pdf-toolbar-hover)] p-0.5">
				<legend className="sr-only">PDF zoom</legend>
				<Button
					variant="ghost"
					size="icon-lg"
					aria-label="Zoom out"
					title="Zoom out (−)"
					disabled={!zoom || zoomPercent <= 25}
					onClick={() => zoom?.zoomOut()}
				>
					<Minus aria-hidden="true" />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="min-w-14 tabular-nums"
					aria-label={`Fit page, currently ${zoomPercent} percent`}
					title="Fit page (0)"
					disabled={!zoom}
					onClick={() =>
						zoom?.requestZoom(
							layout === "continuous" ? ZoomMode.FitWidth : ZoomMode.FitPage,
						)
					}
				>
					{zoomPercent}%
				</Button>
				<Button
					variant="ghost"
					size="icon-lg"
					aria-label="Zoom in"
					title="Zoom in (+)"
					disabled={!zoom || zoomPercent >= 400}
					onClick={() => zoom?.zoomIn()}
				>
					<Plus aria-hidden="true" />
				</Button>
			</fieldset>

			<ToggleGroup
				aria-label="PDF page layout"
				variant="segmented"
				size="lg"
				spacing={0}
				value={[layout]}
				onValueChange={(values) => {
					const next = values.at(-1) as PdfLayoutMode | undefined;
					if (next) onLayoutChange(next);
				}}
				className="shrink-0"
			>
				<ToggleGroupItem
					value="page"
					aria-label="Single page"
					title="Single page"
				>
					<File aria-hidden="true" />
				</ToggleGroupItem>
				<ToggleGroupItem
					value="continuous"
					aria-label="Continuous pages"
					title="Continuous pages"
				>
					<Rows aria-hidden="true" />
				</ToggleGroupItem>
				<ToggleGroupItem
					value="spread"
					aria-label="Two-page spread"
					title="Two-page spread"
				>
					<Columns aria-hidden="true" />
				</ToggleGroupItem>
			</ToggleGroup>

			<Button
				variant="ghost"
				size="icon-lg"
				aria-label={`Rotate clockwise, currently ${rotation * 90} degrees`}
				title="Rotate clockwise (Shift+R)"
				disabled={!rotate}
				onClick={() => rotate?.rotateForward()}
			>
				<ArrowClockwise aria-hidden="true" />
			</Button>
			<Button
				variant="ghost"
				size="icon-lg"
				aria-label="Pan document"
				aria-pressed={isPanning}
				title="Pan document"
				disabled={!pan}
				onClick={() => pan?.togglePan()}
			>
				<Hand aria-hidden="true" weight={isPanning ? "fill" : "regular"} />
			</Button>

			<span
				role="status"
				aria-label="PDF page position"
				aria-live="polite"
				className="min-w-16 shrink-0 px-2 text-center text-xs tabular-nums opacity-70 max-[30rem]:order-last max-[30rem]:w-full max-[30rem]:py-0.5"
			>
				{pageNumber} / {pageCount}
			</span>
		</nav>
	);
}
