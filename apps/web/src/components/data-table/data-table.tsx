import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import {
	type ColumnDef,
	type RowData,
	type TableOptions,
	useTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import type { DataTableFeatures } from "@/components/data-table/table-features";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface DataTableProps<
	TFeatures extends DataTableFeatures,
	TData extends RowData,
> {
	/**
	 * The table's registered feature set. Pass `dataTableFeatures`, or the
	 * `defineTableFeatures<Meta>()` result when the columns read `table.options.meta`.
	 */
	features: TFeatures;
	// biome-ignore lint/suspicious/noExplicitAny: matches `columnHelper.columns()`, so columns of differing TValue fit one array
	columns: ColumnDef<TFeatures, TData, any>[];
	data: TData[];
	isLoading?: boolean;
	emptyState?: {
		icon?: ReactNode;
		title?: string;
		description: string;
		action?: ReactNode;
	};
	tableLabel?: string;
	searchPlaceholder?: string;
	searchColumn?: string;
	toolbar?: ReactNode;
	meta?: TableOptions<TFeatures, TData>["meta"];
	getRowId?: TableOptions<TFeatures, TData>["getRowId"];
	pageSize?: number;
	variant?: "default" | "plain";
	paginationLabels?: {
		page: (page: number, pageCount: number) => string;
		previous: string;
		next: string;
	};
}

const SORT_ARIA = {
	asc: "ascending",
	desc: "descending",
} as const;

function DataTable<TFeatures extends DataTableFeatures, TData extends RowData>({
	features,
	columns,
	data,
	isLoading,
	emptyState,
	tableLabel,
	searchPlaceholder,
	searchColumn,
	toolbar,
	meta,
	getRowId,
	pageSize = 10,
	variant = "default",
	paginationLabels,
}: DataTableProps<TFeatures, TData>) {
	// `TFeatures` only ever differs from `DataTableFeatures` by the phantom
	// `tableMeta` slot, which v9 strips at runtime and which nothing below reads.
	// Resolving to the concrete feature set here is what makes the sorting,
	// filtering and pagination APIs visible — they stay deferred on a bare generic.
	//
	// No selector: the body reads sorting, column filters and pagination, so it
	// has to re-render on all three. Narrowing here would freeze the rows.
	const table = useTable({
		features,
		data,
		columns,
		getRowId,
		meta,
		initialState: { pagination: { pageIndex: 0, pageSize } },
	} as unknown as TableOptions<DataTableFeatures, TData>);

	const columnCount = table.getAllLeafColumns().length;
	const rows = table.getRowModel().rows;
	const pageCount = table.getPageCount();
	const showPagination = !isLoading && pageCount > 1;
	const searchValue = searchColumn
		? ((table.getColumn(searchColumn)?.getFilterValue() as string) ?? "")
		: "";

	return (
		<div className="space-y-4">
			{(searchColumn || toolbar) && (
				<div className="flex items-center gap-2">
					{searchColumn && (
						<Input
							placeholder={searchPlaceholder ?? "Search..."}
							value={searchValue}
							onChange={(e) =>
								table.getColumn(searchColumn)?.setFilterValue(e.target.value)
							}
							className="max-w-xs"
						/>
					)}
					{toolbar && <div className="ms-auto">{toolbar}</div>}
				</div>
			)}

			<div
				className={cn(
					"overflow-hidden",
					variant === "default" && "rounded-lg ring-1 ring-foreground/10",
				)}
			>
				<Table aria-label={tableLabel}>
					<TableHeader
						className={
							variant === "plain" ? "[&_tr]:border-border/60" : undefined
						}
					>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => {
									const sorted = header.column.getIsSorted();
									return (
										<TableHead
											key={header.id}
											scope="col"
											colSpan={header.colSpan > 1 ? header.colSpan : undefined}
											aria-sort={
												header.column.getCanSort()
													? sorted
														? SORT_ARIA[sorted]
														: "none"
													: undefined
											}
										>
											{header.isPlaceholder ? null : (
												<table.FlexRender header={header} />
											)}
										</TableHead>
									);
								})}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: 3 }).map((_, i) => (
								<TableRow
									// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
									key={`skeleton-${i}`}
									className={
										variant === "plain" ? "border-border/60" : undefined
									}
								>
									{Array.from({ length: columnCount }).map((_, j) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cells
										<TableCell key={`skeleton-cell-${j}`}>
											<Skeleton className="h-5 w-full rounded" />
										</TableCell>
									))}
								</TableRow>
							))
						) : rows.length > 0 ? (
							rows.map((row) => (
								<TableRow
									key={row.id}
									className={
										variant === "plain" ? "border-border/60" : undefined
									}
								>
									{row.getAllCells().map((cell) => (
										<TableCell key={cell.id}>
											<table.FlexRender cell={cell} />
										</TableCell>
									))}
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={columnCount} className="h-24 text-center">
									{emptyState ? (
										<div className="flex flex-col items-center gap-1">
											{emptyState.icon}
											{emptyState.title && (
												<p className="font-medium text-sm">
													{emptyState.title}
												</p>
											)}
											<p className="text-muted-foreground text-sm">
												{emptyState.description}
											</p>
											{emptyState.action && (
												<div className="mt-2">{emptyState.action}</div>
											)}
										</div>
									) : (
										<span className="text-muted-foreground">No results.</span>
									)}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			{showPagination && (
				<div className="flex items-center justify-between">
					<p className="text-muted-foreground text-xs">
						{paginationLabels?.page(
							table.state.pagination.pageIndex + 1,
							pageCount,
						) ?? `Page ${table.state.pagination.pageIndex + 1} of ${pageCount}`}
					</p>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							aria-label={paginationLabels?.previous ?? "Previous page"}
							onClick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
						>
							<CaretLeft />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							aria-label={paginationLabels?.next ?? "Next page"}
							onClick={() => table.nextPage()}
							disabled={!table.getCanNextPage()}
						>
							<CaretRight />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

export type { DataTableProps };
export { DataTable };
