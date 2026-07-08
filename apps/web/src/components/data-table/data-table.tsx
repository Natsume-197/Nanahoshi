import {
	type ColumnDef,
	type ColumnFiltersState,
	type ExpandedState,
	flexRender,
	getCoreRowModel,
	getExpandedRowModel,
	getFilteredRowModel,
	getPaginationRowModel,
	getSortedRowModel,
	type PaginationState,
	type Row,
	type SortingState,
	type TableMeta,
	useReactTable,
} from "@tanstack/react-table";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Fragment, type ReactNode, useState } from "react";
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

interface DataTableProps<TData, TValue> {
	columns: ColumnDef<TData, TValue>[];
	data: TData[];
	isLoading?: boolean;
	emptyState?: { icon?: ReactNode; title?: string; description: string };
	searchPlaceholder?: string;
	searchColumn?: string;
	toolbar?: ReactNode;
	renderSubComponent?: (props: { row: Row<TData> }) => ReactNode;
	getRowCanExpand?: (row: Row<TData>) => boolean;
	meta?: TableMeta<TData>;
	pageSize?: number;
}

function DataTable<TData, TValue>({
	columns,
	data,
	isLoading,
	emptyState,
	searchPlaceholder,
	searchColumn,
	toolbar,
	renderSubComponent,
	getRowCanExpand,
	meta,
	pageSize = 10,
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [expanded, setExpanded] = useState<ExpandedState>({});
	const [pagination, setPagination] = useState<PaginationState>({
		pageIndex: 0,
		pageSize,
	});

	const table = useReactTable({
		data,
		columns,
		state: { sorting, columnFilters, expanded, pagination },
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onExpandedChange: setExpanded,
		onPaginationChange: setPagination,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getRowCanExpand,
		meta,
	});

	const pageCount = table.getPageCount();
	const showPagination = !isLoading && pageCount > 1;

	return (
		<div className="space-y-4">
			{(searchColumn || toolbar) && (
				<div className="flex items-center gap-2">
					{searchColumn && (
						<Input
							placeholder={searchPlaceholder ?? "Search..."}
							value={
								(table.getColumn(searchColumn)?.getFilterValue() as string) ??
								""
							}
							onChange={(e) =>
								table.getColumn(searchColumn)?.setFilterValue(e.target.value)
							}
							className="max-w-xs"
						/>
					)}
					{toolbar && <div className="ml-auto">{toolbar}</div>}
				</div>
			)}

			<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
				<Table>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id}>
								{headerGroup.headers.map((header) => (
									<TableHead key={header.id}>
										{header.isPlaceholder
											? null
											: flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{isLoading ? (
							Array.from({ length: 3 }).map((_, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
								<TableRow key={`skeleton-${i}`}>
									{columns.map((_, j) => (
										// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cells
										<TableCell key={`skeleton-cell-${j}`}>
											<Skeleton className="h-5 w-full rounded" />
										</TableCell>
									))}
								</TableRow>
							))
						) : table.getRowModel().rows.length > 0 ? (
							table.getRowModel().rows.map((row) => (
								<Fragment key={row.id}>
									<TableRow
										data-state={row.getIsSelected() ? "selected" : undefined}
									>
										{row.getVisibleCells().map((cell) => (
											<TableCell key={cell.id}>
												{flexRender(
													cell.column.columnDef.cell,
													cell.getContext(),
												)}
											</TableCell>
										))}
									</TableRow>
									{row.getIsExpanded() && renderSubComponent && (
										<TableRow key={`${row.id}-expanded`}>
											<TableCell colSpan={row.getVisibleCells().length}>
												{renderSubComponent({ row })}
											</TableCell>
										</TableRow>
									)}
								</Fragment>
							))
						) : (
							<TableRow>
								<TableCell
									colSpan={columns.length}
									className="h-24 text-center"
								>
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
						Page {table.getState().pagination.pageIndex + 1} of {pageCount}
					</p>
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							onClick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
						>
							<CaretLeft />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
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
