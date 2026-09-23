// Chrome shared by every section of the metadata tray (book metadata and
// Read & Listen pairings), so both lists look and behave the same around
// their rows.

import { CaretLeft, CaretRight, MagnifyingGlass } from "@phosphor-icons/react";
import { Fragment, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { m } from "@/paraglide/messages";
import { visiblePageNumbers } from "./pagination";

export function TrayToolbar({ children }: { children: ReactNode }) {
	return (
		<div className="flex shrink-0 flex-wrap items-center gap-2 border-border/60 border-b px-3 py-2.5">
			{children}
		</div>
	);
}

export function TraySearch({
	value,
	onValueChange,
	onCommit,
	placeholder = m["enrichment.search_placeholder"](),
}: {
	value: string;
	onValueChange: (value: string) => void;
	/** Blur/Enter: flush a pending debounce right away. */
	onCommit?: () => void;
	placeholder?: string;
}) {
	return (
		<div className="relative order-last w-full min-w-0 flex-1 sm:order-none sm:ms-auto sm:max-w-72">
			<MagnifyingGlass className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
			<Input
				type="search"
				value={value}
				onChange={(event) => onValueChange(event.target.value)}
				onBlur={onCommit}
				onKeyDown={(event) => {
					if (event.key === "Enter") onCommit?.();
				}}
				placeholder={placeholder}
				aria-label={placeholder}
				className="h-[30px] w-full rounded-full ps-8 text-xs"
			/>
		</div>
	);
}

export function TrayBulkBar({
	count,
	total,
	offerSelectAll,
	onSelectAll,
	onClear,
	busy,
	children,
}: {
	count: number;
	total: number;
	/** Whole page selected but more results exist beyond it. */
	offerSelectAll: boolean;
	onSelectAll: () => void;
	onClear: () => void;
	busy: boolean;
	children: ReactNode;
}) {
	return (
		<div
			role="toolbar"
			aria-label={m["enrichment.bulk_actions"]()}
			className="bar-in flex shrink-0 flex-wrap items-center gap-1.5 border-border/60 border-t bg-muted/40 px-3 py-2"
		>
			<span
				aria-live="polite"
				className="ps-1 font-medium text-sm tabular-nums"
			>
				{m["enrichment.selected_count"]({ count })}
			</span>
			{offerSelectAll && (
				<button
					type="button"
					onClick={onSelectAll}
					className="font-medium text-primary text-sm hover:underline"
				>
					{m["enrichment.select_all_results"]({ count: total })}
				</button>
			)}
			<div className="mx-1 h-5 w-px bg-border" />
			{children}
			<Button
				size="sm"
				variant="ghost"
				className="ms-auto"
				onClick={onClear}
				disabled={busy}
			>
				{m["enrichment.clear_selection"]()}
			</Button>
		</div>
	);
}

export function TrayPagination({
	offset,
	pageSize,
	total,
	currentPage,
	totalPages,
	onPageChange,
}: {
	offset: number;
	pageSize: number;
	total: number;
	currentPage: number;
	totalPages: number;
	onPageChange: (page: number) => void;
}) {
	const pages = visiblePageNumbers(currentPage, totalPages);
	return (
		<div className="flex shrink-0 items-center justify-between gap-3 border-border/60 border-t px-3 py-2">
			<p className="text-muted-foreground text-xs tabular-nums">
				{m["enrichment.showing_range"]({
					from: offset + 1,
					to: Math.min(offset + pageSize, total),
					total,
				})}
			</p>
			{totalPages > 1 && (
				<nav
					aria-label={m["enrichment.pagination"]()}
					className="flex items-center gap-1"
				>
					<Button
						size="icon-sm"
						variant="ghost"
						onClick={() => onPageChange(currentPage - 1)}
						disabled={currentPage <= 1}
						aria-label={m["enrichment.previous_page"]()}
					>
						<CaretLeft />
					</Button>
					{pages.map((page, index) => {
						const previousPage = pages[index - 1];
						return (
							<Fragment key={page}>
								{previousPage != null && page - previousPage > 1 && (
									<span
										aria-hidden="true"
										className="px-1 text-muted-foreground text-sm"
									>
										…
									</span>
								)}
								<Button
									size="icon-sm"
									variant={page === currentPage ? "default" : "ghost"}
									onClick={() => onPageChange(page)}
									aria-current={page === currentPage ? "page" : undefined}
									aria-label={m["enrichment.go_to_page"]({ page })}
								>
									{page}
								</Button>
							</Fragment>
						);
					})}
					<Button
						size="icon-sm"
						variant="ghost"
						onClick={() => onPageChange(currentPage + 1)}
						disabled={currentPage >= totalPages}
						aria-label={m["enrichment.next_page"]()}
					>
						<CaretRight />
					</Button>
				</nav>
			)}
		</div>
	);
}
