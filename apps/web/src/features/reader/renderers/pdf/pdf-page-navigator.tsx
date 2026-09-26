import { ThumbnailsPane } from "@embedpdf/plugin-thumbnail/react";
import { CaretLeft, File, X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import type { ReaderTheme } from "@/features/reader/presentation/settings";
import { readerMix } from "@/features/reader/ui/controls/reader-controls";
import { m } from "@/paraglide/messages";
import { type PdfBitmapStore, PdfPageThumbnail } from "./pdf-page-raster";

interface PdfPageNavigatorProps {
	documentId: string;
	open: boolean;
	theme: ReaderTheme;
	pageNumber: number;
	pageCount: number;
	onClose: () => void;
	onPageChange: (page: number) => void;
	store: PdfBitmapStore;
}

/**
 * EmbedPDF virtualizes the rail; images come from the reader's page store,
 * so thumbnails reuse its previews and render on the same parallel lanes.
 */
export function PdfPageNavigator({
	documentId,
	open,
	theme,
	pageNumber,
	pageCount,
	onClose,
	onPageChange,
	store,
}: PdfPageNavigatorProps) {
	if (!open) return null;

	const mix = (percentage: number) => readerMix(theme, percentage);
	return (
		<>
			<button
				type="button"
				aria-label="Close PDF page navigator"
				className="fixed inset-0 z-[11] bg-black/20 lg:hidden"
				onClick={onClose}
			/>
			<aside
				aria-label="PDF page navigator"
				className="writing-horizontal-tb fixed top-[calc(3.25rem+var(--safe-area-top))] bottom-0 left-0 z-[12] flex w-[min(18rem,calc(100dvw-2rem))] flex-col border-r shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none sm:top-[calc(3rem+var(--safe-area-top))]"
				style={{
					color: theme.fontColor,
					backgroundColor: theme.backgroundColor,
					borderColor: mix(14),
				}}
			>
				<header
					className="flex h-12 shrink-0 items-center gap-2 border-b px-3"
					style={{ borderColor: mix(12) }}
				>
					<File aria-hidden="true" className="size-4 opacity-65" />
					<h2 className="min-w-0 flex-1 font-medium text-sm">
						{m.reader_pdf_pages()}
					</h2>
					<form
						className="flex items-center gap-1 text-xs tabular-nums"
						onSubmit={(event) => {
							event.preventDefault();
							const page = Number.parseInt(
								String(new FormData(event.currentTarget).get("page")),
								10,
							);
							if (Number.isFinite(page))
								onPageChange(Math.min(Math.max(page, 1), pageCount));
						}}
					>
						<input
							key={pageNumber}
							name="page"
							type="number"
							inputMode="numeric"
							min={1}
							max={pageCount}
							defaultValue={pageNumber}
							aria-label={m.reader_pdf_go_to_page()}
							title={m.reader_pdf_go_to_page()}
							className="h-8 w-14 rounded-md border bg-transparent px-1 text-center text-sm outline-none focus-visible:ring-2"
							style={{ borderColor: mix(16) }}
						/>
						<span className="opacity-60">/ {pageCount}</span>
					</form>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Close PDF page navigator"
						onClick={onClose}
					>
						<X aria-hidden="true" className="size-4" />
					</Button>
				</header>
				<ThumbnailsPane
					documentId={documentId}
					className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
				>
					{(meta) => {
						const page = meta.pageIndex + 1;
						const selected = page === pageNumber;
						return (
							<button
								key={page}
								type="button"
								className={`absolute inset-x-0 flex flex-col items-center rounded-xl px-2 pb-2 text-sm transition-[background-color,color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${selected ? "font-medium" : "opacity-75 hover:opacity-100"}`}
								style={{
									top: meta.top,
									height: meta.wrapperHeight,
									backgroundColor: selected ? mix(10) : undefined,
								}}
								onClick={() => onPageChange(page)}
							>
								<div
									className="overflow-hidden rounded-md border bg-white shadow-sm"
									style={{
										width: meta.width,
										height: meta.height,
										borderColor: mix(selected ? 28 : 14),
									}}
								>
									<PdfPageThumbnail
										store={store}
										pageIndex={meta.pageIndex}
										width={meta.width}
										height={meta.height}
									/>
								</div>
								<span className="mt-1 flex items-center gap-1 text-xs tabular-nums">
									{m.reader_pdf_page({ page })}
									{selected && (
										<CaretLeft
											aria-hidden="true"
											className="size-3 rotate-180"
										/>
									)}
								</span>
							</button>
						);
					}}
				</ThumbnailsPane>
			</aside>
		</>
	);
}
