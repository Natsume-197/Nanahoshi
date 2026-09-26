import { useExport } from "@embedpdf/plugin-export/react";
import { usePrint } from "@embedpdf/plugin-print/react";
import { useRotate } from "@embedpdf/plugin-rotate/react";
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react";
import {
	ArrowClockwise,
	ArrowsDownUp,
	ArrowsLeftRight,
	Book,
	BookOpen,
	CircleHalf,
	DownloadSimple,
	File,
	Hand,
	Minus,
	Plus,
	Printer,
} from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { ReaderMenuItem } from "@/features/reader/ui/chrome/reader-header";
import { m } from "@/paraglide/messages";
import type { PdfPageTone } from "./pdf-view-preferences";
import type { PdfLayoutMode, PdfScrollDirection } from "./pdf-view-state";

const MIN_ZOOM_PERCENT = 25;
const MAX_ZOOM_PERCENT = 400;

export function fitZoomMode(
	layout: PdfLayoutMode,
	scrollDirection: PdfScrollDirection,
) {
	return layout === "page" && scrollDirection === "vertical"
		? ZoomMode.FitWidth
		: ZoomMode.FitPage;
}

/** PDF-only rows for the shared reader header's ⋮ menu. */
export function PdfReaderMenu({
	documentId,
	layout,
	scrollDirection,
	isPanning,
	pageTone,
	onPageToneChange,
	close,
	onLayoutChange,
	onScrollDirectionChange,
	onPanningChange,
}: {
	documentId: string;
	layout: PdfLayoutMode;
	scrollDirection: PdfScrollDirection;
	isPanning: boolean;
	pageTone: PdfPageTone;
	onPageToneChange: (tone: PdfPageTone) => void;
	close: () => void;
	onLayoutChange: (layout: PdfLayoutMode) => void;
	onScrollDirectionChange: (direction: PdfScrollDirection) => void;
	onPanningChange: (panning: boolean) => void;
}) {
	const { state: zoomState, provides: zoom } = useZoom(documentId);
	const { provides: rotate } = useRotate(documentId);
	const { provides: print } = usePrint(documentId);
	const { provides: exportApi } = useExport(documentId);
	const zoomPercent = Math.round(zoomState.currentZoomLevel * 100);
	const closeAnd = (action: () => void) => () => {
		close();
		action();
	};

	return (
		<>
			{/* Zoom stays open so repeated taps can step through levels. */}
			<div className="flex h-11 items-center gap-1 px-1">
				<ZoomButton
					label={m.reader_pdf_zoom_out()}
					disabled={!zoom || zoomPercent <= MIN_ZOOM_PERCENT}
					onClick={() => zoom?.zoomOut()}
				>
					<Minus aria-hidden="true" className="size-4" />
				</ZoomButton>
				<button
					type="button"
					title={m.reader_pdf_zoom_fit()}
					aria-label={m.reader_pdf_zoom_level({ percent: zoomPercent })}
					disabled={!zoom}
					className="h-9 flex-1 cursor-pointer rounded-lg text-sm tabular-nums opacity-80 transition-colors duration-150 hover:bg-[var(--rh-hover)] hover:opacity-100"
					onClick={() =>
						zoom?.requestZoom(fitZoomMode(layout, scrollDirection))
					}
				>
					{zoomPercent}%
				</button>
				<ZoomButton
					label={m.reader_pdf_zoom_in()}
					disabled={!zoom || zoomPercent >= MAX_ZOOM_PERCENT}
					onClick={() => zoom?.zoomIn()}
				>
					<Plus aria-hidden="true" className="size-4" />
				</ZoomButton>
			</div>
			<MenuDivider />
			<ReaderMenuItem
				icon={<File aria-hidden="true" className="size-5" />}
				selected={layout === "page"}
				onClick={closeAnd(() => onLayoutChange("page"))}
			>
				{m.reader_pdf_layout_single()}
			</ReaderMenuItem>
			<ReaderMenuItem
				icon={<BookOpen aria-hidden="true" className="size-5" />}
				selected={layout === "spread-odd"}
				onClick={closeAnd(() => onLayoutChange("spread-odd"))}
			>
				{m.reader_pdf_layout_spread_odd()}
			</ReaderMenuItem>
			<ReaderMenuItem
				icon={<Book aria-hidden="true" className="size-5" />}
				selected={layout === "spread-even"}
				onClick={closeAnd(() => onLayoutChange("spread-even"))}
			>
				{m.reader_pdf_layout_spread_even()}
			</ReaderMenuItem>
			<MenuDivider />
			<ReaderMenuItem
				icon={<ArrowsDownUp aria-hidden="true" className="size-5" />}
				selected={scrollDirection === "vertical"}
				onClick={closeAnd(() => onScrollDirectionChange("vertical"))}
			>
				{m.reader_pdf_scroll_vertical()}
			</ReaderMenuItem>
			<ReaderMenuItem
				icon={<ArrowsLeftRight aria-hidden="true" className="size-5" />}
				selected={scrollDirection === "horizontal"}
				onClick={closeAnd(() => onScrollDirectionChange("horizontal"))}
			>
				{m.reader_pdf_scroll_horizontal()}
			</ReaderMenuItem>
			<MenuDivider />
			<ReaderMenuItem
				icon={<CircleHalf aria-hidden="true" className="size-5" />}
				selected={pageTone === "theme"}
				onClick={closeAnd(() =>
					onPageToneChange(pageTone === "theme" ? "original" : "theme"),
				)}
			>
				{m.reader_pdf_page_tone()}
			</ReaderMenuItem>
			<ReaderMenuItem
				icon={
					<Hand
						aria-hidden="true"
						className="size-5"
						weight={isPanning ? "fill" : "regular"}
					/>
				}
				selected={isPanning}
				onClick={closeAnd(() => onPanningChange(!isPanning))}
			>
				{m.reader_pdf_hand_tool()}
			</ReaderMenuItem>
			<ReaderMenuItem
				icon={<ArrowClockwise aria-hidden="true" className="size-5" />}
				disabled={!rotate}
				onClick={() => rotate?.rotateForward()}
			>
				{m.reader_pdf_rotate()}
			</ReaderMenuItem>
			<ReaderMenuItem
				icon={<Printer aria-hidden="true" className="size-5" />}
				disabled={!print}
				onClick={closeAnd(() => print?.print())}
			>
				{m.reader_pdf_print()}
			</ReaderMenuItem>
			<ReaderMenuItem
				icon={<DownloadSimple aria-hidden="true" className="size-5" />}
				disabled={!exportApi}
				onClick={closeAnd(() => exportApi?.download())}
			>
				{m.reader_pdf_download()}
			</ReaderMenuItem>
		</>
	);
}

function ZoomButton({
	label,
	disabled,
	onClick,
	children,
}: {
	label: string;
	disabled: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			title={label}
			aria-label={label}
			disabled={disabled}
			className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg opacity-80 transition-colors duration-150 hover:bg-[var(--rh-hover)] hover:opacity-100 disabled:pointer-events-none disabled:opacity-40"
			onClick={onClick}
		>
			{children}
		</button>
	);
}

function MenuDivider() {
	return <hr className="my-1 border-current border-t opacity-10" />;
}
