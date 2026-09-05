import { useExport } from "@embedpdf/plugin-export/react";
import { usePrint } from "@embedpdf/plugin-print/react";
import { useRotate } from "@embedpdf/plugin-rotate/react";
import { useZoom, ZoomMode } from "@embedpdf/plugin-zoom/react";
import {
	ArrowClockwise,
	ArrowCounterClockwise,
	ArrowLeft,
	ArrowsDownUp,
	ArrowsLeftRight,
	ArrowsOut,
	CaretLeft,
	CaretRight,
	Check,
	Cursor,
	DotsThree,
	DownloadSimple,
	Flag,
	Hand,
	MagnifyingGlass,
	Minus,
	Plus,
	Printer,
	SidebarSimple,
	SlidersHorizontal,
} from "@phosphor-icons/react";
import { type CSSProperties, type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ReaderTheme } from "@/features/reader/presentation/settings";
import { readerMix } from "@/features/reader/ui/controls/reader-controls";
import type { PdfLayoutMode, PdfScrollDirection } from "./pdf-view-state";

interface PdfNavigationToolbarProps {
	documentId: string;
	theme: ReaderTheme;
	layout: PdfLayoutMode;
	scrollDirection: PdfScrollDirection;
	pageNumber: number;
	pageCount: number;
	documentTitle: string;
	sidebarOpen: boolean;
	onSidebarToggle: () => void;
	onPageChange: (page: number) => void;
	onPreviousPage: () => void;
	onNextPage: () => void;
	onOpenSearch: () => void;
	onCompleteBook: () => void;
	onFullscreen: () => void;
	onOpenSettings: () => void;
	onExit: () => void;
	onLayoutChange: (layout: PdfLayoutMode) => void;
	onScrollDirectionChange: (direction: PdfScrollDirection) => void;
	isPanning: boolean;
	onInteractionToolChange: (tool: "pan" | "select") => void;
}

export function PdfNavigationToolbar({
	documentId,
	theme,
	layout,
	scrollDirection,
	pageNumber,
	pageCount,
	documentTitle,
	sidebarOpen,
	onSidebarToggle,
	onPageChange,
	onPreviousPage,
	onNextPage,
	onOpenSearch,
	onCompleteBook,
	onFullscreen,
	onOpenSettings,
	onExit,
	onLayoutChange,
	onScrollDirectionChange,
	isPanning,
	onInteractionToolChange,
}: PdfNavigationToolbarProps) {
	const { state: zoomState, provides: zoom } = useZoom(documentId);
	const { provides: rotate } = useRotate(documentId);
	const { provides: print } = usePrint(documentId);
	const { provides: exportApi } = useExport(documentId);
	const [requestedPage, setRequestedPage] = useState(String(pageNumber));
	const zoomPercent = Math.round(zoomState.currentZoomLevel * 100);

	useEffect(() => {
		setRequestedPage(String(pageNumber));
	}, [pageNumber]);

	const commitRequestedPage = (value: string) => {
		const page = Number.parseInt(value, 10);
		if (Number.isFinite(page)) {
			const target = Math.min(Math.max(page, 1), Math.max(1, pageCount));
			onPageChange(target);
			setRequestedPage(String(target));
			return;
		}
		setRequestedPage(String(pageNumber));
	};
	const toolbarStyle = {
		color: theme.fontColor,
		backgroundColor: theme.backgroundColor,
		borderColor: readerMix(theme, 15),
		"--pdf-toolbar-hover": readerMix(theme, 8),
	} as CSSProperties;
	const iconClass = "size-4";
	const printDocument = () => {
		print?.print();
	};
	const selectLayout = (nextLayout: PdfLayoutMode) => () =>
		onLayoutChange(nextLayout);
	const selectScrollDirection = (nextDirection: PdfScrollDirection) => () =>
		onScrollDirectionChange(nextDirection);
	return (
		<nav
			aria-label="PDF reader toolbar"
			data-reader-progress
			data-reader-progress-current={pageNumber}
			data-reader-progress-total={pageCount}
			data-reader-progress-percent={(
				(pageNumber / Math.max(1, pageCount)) *
				100
			).toFixed(2)}
			className="nanahoshi-pdf-toolbar writing-horizontal-tb fixed top-0 right-0 left-0 z-[8] flex min-h-[calc(3.25rem+var(--safe-area-top))] items-center gap-1 border-b px-[max(0.5rem,var(--safe-area-left))] pt-[var(--safe-area-top)] pr-[max(0.5rem,var(--safe-area-right))] shadow-md max-sm:flex-wrap max-sm:gap-y-1 max-sm:pb-1 sm:min-h-[calc(3rem+var(--safe-area-top))]"
			style={toolbarStyle}
		>
			<div data-reader-point-actions className="flex shrink-0 items-center" />
			<div className="flex shrink-0 items-center gap-0.5">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Exit PDF reader"
					title="Back to book"
					onClick={onExit}
				>
					<ArrowLeft aria-hidden="true" className={iconClass} />
				</Button>
				<Button
					variant="ghost"
					size="icon"
					aria-label="Toggle PDF page navigator"
					aria-pressed={sidebarOpen}
					title="Pages"
					onClick={onSidebarToggle}
				>
					<SidebarSimple aria-hidden="true" className={iconClass} />
				</Button>
			</div>
			<p
				className="hidden min-w-0 max-w-56 truncate px-2 font-medium text-sm opacity-75 lg:block"
				title={documentTitle}
			>
				{documentTitle}
			</p>

			<form
				onSubmit={(event) => {
					event.preventDefault();
					commitRequestedPage(
						new FormData(event.currentTarget).get("current-page")?.toString() ??
							requestedPage,
					);
				}}
				className="flex shrink-0 items-center gap-0.5 rounded-xl bg-[var(--pdf-toolbar-hover)] p-0.5"
			>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label="Previous PDF page"
					title="Previous page"
					disabled={pageNumber <= 1}
					onClick={onPreviousPage}
				>
					<CaretLeft aria-hidden="true" className={iconClass} />
				</Button>
				<label className="sr-only" htmlFor="pdf-current-page">
					Current PDF page
				</label>
				<input
					id="pdf-current-page"
					name="current-page"
					type="number"
					inputMode="numeric"
					min={1}
					max={Math.max(1, pageCount)}
					value={requestedPage}
					onChange={(event) => setRequestedPage(event.target.value)}
					onBlur={(event) => commitRequestedPage(event.currentTarget.value)}
					className="h-7 w-12 rounded-lg bg-transparent px-1 text-center text-sm tabular-nums outline-none ring-offset-1 focus-visible:ring-2"
				/>
				<span className="pr-1 text-xs tabular-nums opacity-65">
					/ {pageCount}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label="Next PDF page"
					title="Next page"
					disabled={pageNumber >= pageCount}
					onClick={onNextPage}
				>
					<CaretRight aria-hidden="true" className={iconClass} />
				</Button>
				<span
					className="sr-only"
					role="status"
					aria-label="PDF page position"
					aria-live="polite"
				>
					{pageNumber} / {pageCount}
				</span>
			</form>

			<div className="ml-auto flex shrink-0 items-center gap-0.5">
				<Button
					variant="ghost"
					size="icon"
					aria-label="Search this PDF"
					title="Search"
					onClick={onOpenSearch}
				>
					<MagnifyingGlass aria-hidden="true" className={iconClass} />
				</Button>
				<fieldset className="hidden items-center gap-0.5 rounded-xl bg-[var(--pdf-toolbar-hover)] p-0.5 md:flex">
					<legend className="sr-only">PDF zoom</legend>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Zoom out"
						title="Zoom out (−)"
						disabled={!zoom || zoomPercent <= 25}
						onClick={() => zoom?.zoomOut()}
					>
						<Minus aria-hidden="true" className={iconClass} />
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
								layout === "page" && scrollDirection === "vertical"
									? ZoomMode.FitWidth
									: ZoomMode.FitPage,
							)
						}
					>
						{zoomPercent}%
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Zoom in"
						title="Zoom in (+)"
						disabled={!zoom || zoomPercent >= 400}
						onClick={() => zoom?.zoomIn()}
					>
						<Plus aria-hidden="true" className={iconClass} />
					</Button>
				</fieldset>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Open PDF presentation settings"
							title="Presentation settings"
						>
							<SlidersHorizontal aria-hidden="true" className={iconClass} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="w-64 border p-1"
						style={{
							color: theme.fontColor,
							backgroundColor: theme.backgroundColor,
							borderColor: readerMix(theme, 15),
						}}
					>
						<PresentationGroup title="Page layout">
							<PresentationItem
								selected={layout === "page"}
								onClick={selectLayout("page")}
								icon={<span className="size-5 rounded-sm border-2" />}
							>
								Single page
							</PresentationItem>
							<PresentationItem
								selected={layout === "spread-odd"}
								onClick={selectLayout("spread-odd")}
								icon={
									<span className="flex size-5 gap-0.5">
										<span className="w-1/2 border-2" />
										<span className="w-1/2 border-2" />
									</span>
								}
							>
								Two page (odd)
							</PresentationItem>
							<PresentationItem
								selected={layout === "spread-even"}
								onClick={selectLayout("spread-even")}
								icon={
									<span className="flex size-5 gap-0.5">
										<span className="w-1/2 border-2" />
										<span className="w-1/2 border-2" />
									</span>
								}
							>
								Two page (even)
							</PresentationItem>
						</PresentationGroup>
						<PresentationGroup title="Scroll layout">
							<PresentationItem
								selected={scrollDirection === "vertical"}
								onClick={selectScrollDirection("vertical")}
								icon={<ArrowsDownUp aria-hidden="true" className={iconClass} />}
							>
								Vertical
							</PresentationItem>
							<PresentationItem
								selected={scrollDirection === "horizontal"}
								onClick={selectScrollDirection("horizontal")}
								icon={
									<ArrowsLeftRight aria-hidden="true" className={iconClass} />
								}
							>
								Horizontal
							</PresentationItem>
						</PresentationGroup>
						<PresentationGroup title="Page rotation">
							<PresentationItem
								onClick={() => rotate?.rotateForward()}
								disabled={!rotate}
								icon={
									<ArrowClockwise aria-hidden="true" className={iconClass} />
								}
							>
								Rotate clockwise
							</PresentationItem>
							<PresentationItem
								onClick={() => rotate?.rotateBackward()}
								disabled={!rotate}
								icon={
									<ArrowCounterClockwise
										aria-hidden="true"
										className={iconClass}
									/>
								}
							>
								Rotate counter-clockwise
							</PresentationItem>
						</PresentationGroup>
						<PresentationItem
							onClick={onFullscreen}
							icon={<ArrowsOut aria-hidden="true" className={iconClass} />}
						>
							Fullscreen
						</PresentationItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<fieldset className="flex items-center gap-0.5 rounded-xl bg-[var(--pdf-toolbar-hover)] p-0.5">
					<legend className="sr-only">PDF interaction tool</legend>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Pan document"
						aria-pressed={isPanning}
						title="Pan document"
						className={isPanning ? "bg-[var(--pdf-toolbar-hover)]" : ""}
						onClick={() => onInteractionToolChange("pan")}
					>
						<Hand
							aria-hidden="true"
							className={iconClass}
							weight={isPanning ? "fill" : "regular"}
						/>
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Select PDF text"
						aria-pressed={!isPanning}
						title="Select text"
						className={!isPanning ? "bg-[var(--pdf-toolbar-hover)]" : ""}
						onClick={() => onInteractionToolChange("select")}
					>
						<Cursor aria-hidden="true" className={iconClass} />
					</Button>
				</fieldset>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							aria-label="Open PDF reader menu"
							title="More reader actions"
						>
							<DotsThree aria-hidden="true" className={iconClass} />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="w-52 border"
						style={{
							color: theme.fontColor,
							backgroundColor: theme.backgroundColor,
							borderColor: readerMix(theme, 15),
						}}
					>
						<DropdownMenuItem onClick={onOpenSettings}>
							<SlidersHorizontal aria-hidden="true" />
							Open Quick Settings
						</DropdownMenuItem>
						<DropdownMenuItem disabled={!print} onClick={printDocument}>
							<Printer aria-hidden="true" />
							Print PDF
						</DropdownMenuItem>
						<DropdownMenuItem
							disabled={!exportApi}
							onClick={() => exportApi?.download()}
						>
							<DownloadSimple aria-hidden="true" />
							Download PDF
						</DropdownMenuItem>
						<DropdownMenuItem onClick={onCompleteBook}>
							<Flag aria-hidden="true" />
							Complete Book
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</nav>
	);
}

function PresentationGroup({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<section className="border-b px-1 py-2 last:border-b-0">
			<h3 className="px-2 pb-1 font-medium text-[0.6875rem] uppercase tracking-wide opacity-60">
				{title}
			</h3>
			{children}
		</section>
	);
}

function PresentationItem({
	children,
	icon,
	selected = false,
	disabled = false,
	onClick,
}: {
	children: ReactNode;
	icon: ReactNode;
	selected?: boolean;
	disabled?: boolean;
	onClick: () => void;
}) {
	return (
		<DropdownMenuItem
			disabled={disabled}
			onClick={onClick}
			className={`min-h-9 gap-3 ${selected ? "bg-[var(--pdf-toolbar-hover)] font-medium" : ""}`}
		>
			<span className="flex size-5 shrink-0 items-center justify-center">
				{icon}
			</span>
			<span className="min-w-0 flex-1">{children}</span>
			{selected && <Check aria-label="Selected" className="size-4" />}
		</DropdownMenuItem>
	);
}
