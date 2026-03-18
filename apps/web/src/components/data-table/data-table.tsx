import {
	type ColumnDef,
	type ColumnFiltersState,
	type ExpandedState,
	flexRender,
	getCoreRowModel,
	getExpandedRowModel,
	getFilteredRowModel,
	getSortedRowModel,
	type Row,
	type SortingState,
	type TableMeta,
	useReactTable,
} from "@tanstack/react-table";
import { Fragment, type ReactNode, useState } from "react";
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
}: DataTableProps<TData, TValue>) {
	const [sorting, setSorting] = useState<SortingState>([]);
	const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
	const [expanded, setExpanded] = useState<ExpandedState>({});

	const table = useReactTable({
		data,
		columns,
		state: { sorting, columnFilters, expanded },
		onSortingChange: setSorting,
		onColumnFiltersChange: setColumnFilters,
		onExpandedChange: setExpanded,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: getSortedRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getExpandedRowModel: getExpandedRowModel(),
		getRowCanExpand,
		meta,
	});

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
										key={row.id}
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
		</div>
	);
}

export { DataTable };
export type { DataTableProps };
