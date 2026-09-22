import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	horizontalListSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	ArrowsDownUp,
	CaretDown,
	CaretUp,
	FunnelSimple,
} from "@phosphor-icons/react";
import {
	type ColumnFiltersState,
	type ColumnOrderState,
	type ColumnPinningState,
	type ColumnSizingState,
	columnFilteringFeature,
	columnOrderingFeature,
	columnPinningFeature,
	columnResizingFeature,
	columnSizingFeature,
	columnVisibilityFeature,
	createColumnHelper,
	functionalUpdate,
	type Header,
	type RowSelectionState,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import type { Dispatch, SetStateAction } from "react";
import {
	type CSSProperties,
	type MouseEvent as ReactMouseEvent,
	type ReactNode,
	useEffect,
	useState,
} from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatRelativeTime } from "@/utils/format";
import {
	type BucketFilter,
	LIFECYCLE_BUCKET,
	type EnrichmentLifecycle as Lifecycle,
	PAGE_SIZE,
	parseEnrichmentSort,
	type EnrichmentSort as Sort,
} from "./filters";
import { LIFECYCLE_LABELS, LifecycleChip } from "./lifecycle";
import { IconSwap } from "./match-controls";
import {
	BookCell,
	EnrichmentCard,
	EnrichmentRow,
	MatchCell,
	PrimaryRowButton,
	RowMenu,
} from "./match-rows";
import type { ScopeSelection } from "./match-sidebar";
import {
	DEFAULT_COLUMN_PINNING,
	DEFAULT_COLUMN_SIZING,
	MATCH_COLUMN_ORDER,
	readTablePreferences,
	writeTablePreferences,
} from "./table-preferences";
import type { MatchRow, RowActions } from "./types";

const MATCH_TABLE_FEATURES = tableFeatures({
	columnFilteringFeature,
	columnOrderingFeature,
	columnPinningFeature,
	columnResizingFeature,
	columnSizingFeature,
	columnVisibilityFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
});
const matchColumnHelper = createColumnHelper<
	typeof MATCH_TABLE_FEATURES,
	MatchRow
>();

export const SKELETON_ROWS = [
	"s1",
	"s2",
	"s3",
	"s4",
	"s5",
	"s6",
	"s7",
	"s8",
	"s9",
	"s10",
];

type MatchTableOptions = {
	onPageChange: (page: number) => void;
	items: MatchRow[];
	total: number;
	page: number;
	sort?: Sort;
	search: string;
	lifecycle?: Lifecycle;
	bucket: BucketFilter;
	detailUuid: string | null;
	providerLabels: Record<string, string>;
	rowSelection: RowSelectionState;
	setRowSelection: Dispatch<SetStateAction<RowSelectionState>>;
	selectAllFilter: boolean;
	setSelectAllFilter: (value: boolean) => void;
	setSearch: (value: string) => void;
	applyScope: (scope: ScopeSelection) => void;
	patchFilters: (
		patch: { sort?: Sort },
		options: { keepSelection: boolean },
	) => void;
	openDetail: (item: MatchRow) => void;
	rowActions: (item: MatchRow) => RowActions;
};

export function useMatchTable({
	items,
	total,
	page,
	sort,
	search,
	lifecycle,
	bucket,
	detailUuid,
	providerLabels,
	rowSelection,
	setRowSelection,
	selectAllFilter,
	setSelectAllFilter,
	setSearch,
	applyScope,
	patchFilters,
	openDetail,
	rowActions,
	onPageChange,
}: MatchTableOptions) {
	const [columnOrder, setColumnOrder] =
		useState<ColumnOrderState>(MATCH_COLUMN_ORDER);
	const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(
		DEFAULT_COLUMN_SIZING,
	);
	const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(
		DEFAULT_COLUMN_PINNING,
	);
	const [tablePreferencesReady, setTablePreferencesReady] = useState(false);

	useEffect(() => {
		try {
			const saved = readTablePreferences(localStorage);
			if (saved) {
				setColumnOrder(saved.order);
				setColumnSizing(saved.sizing);
				setColumnPinning(saved.pinning);
			}
		} catch {
			/* Accessing localStorage itself can be blocked by the browser. */
		}
		setTablePreferencesReady(true);
	}, []);
	useEffect(() => {
		if (!tablePreferencesReady) return;
		try {
			writeTablePreferences(localStorage, {
				order: columnOrder,
				sizing: columnSizing,
				pinning: columnPinning,
			});
		} catch {
			/* Storage is optional. */
		}
	}, [columnOrder, columnPinning, columnSizing, tablePreferencesReady]);

	const matchColumns = matchColumnHelper.columns([
		matchColumnHelper.display({
			id: "select",
			size: DEFAULT_COLUMN_SIZING.select,
			enableHiding: false,
			enableResizing: false,
			header: ({ table }) => {
				const allSelected = table.getIsAllPageRowsSelected();
				return (
					<Checkbox
						checked={selectAllFilter || allSelected}
						indeterminate={
							!selectAllFilter && table.getIsSomePageRowsSelected()
						}
						onCheckedChange={() => {
							setSelectAllFilter(false);
							table.toggleAllPageRowsSelected(!allSelected);
						}}
						aria-label={m["enrichment.select_page"]()}
					/>
				);
			},
			cell: ({ row }) => (
				<Checkbox
					checked={selectAllFilter || row.getIsSelected()}
					onCheckedChange={() => {
						setSelectAllFilter(false);
						row.toggleSelected();
					}}
					aria-label={row.original.title ?? row.id}
				/>
			),
		}),
		matchColumnHelper.display({
			id: "book",
			size: DEFAULT_COLUMN_SIZING.book,
			minSize: 240,
			enableSorting: true,
			header: ({ column }) => {
				const sorted = column.getIsSorted();
				return (
					<SortHeader
						label={m["enrichment.col_book"]()}
						active={Boolean(sorted)}
						direction={sorted === "desc" ? "desc" : "asc"}
						onClick={(event) => column.toggleSorting(undefined, event.shiftKey)}
						sortIndex={column.getSortIndex()}
					/>
				);
			},
			cell: ({ row }) => (
				<BookCell item={row.original} open={row.id === detailUuid} />
			),
		}),
		matchColumnHelper.display({
			id: "match",
			size: DEFAULT_COLUMN_SIZING.match,
			minSize: 200,
			header: () => m["enrichment.col_match"](),
			cell: ({ row }) => (
				<MatchCell item={row.original} providerLabels={providerLabels} />
			),
		}),
		matchColumnHelper.display({
			id: "status",
			size: DEFAULT_COLUMN_SIZING.status,
			minSize: 128,
			header: ({ column }) => (
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<button
							type="button"
							className="inline-flex items-center gap-1 font-medium text-xs hover:text-foreground"
						>
							{m["enrichment.col_status"]()}
							<FunnelSimple className="size-3" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="start">
						<DropdownMenuItem onClick={() => column.setFilterValue(undefined)}>
							{m["enrichment.lifecycle_all"]()}
						</DropdownMenuItem>
						{Object.entries(LIFECYCLE_LABELS).map(([value, label]) => (
							<DropdownMenuCheckboxItem
								key={value}
								checked={lifecycle === value}
								onCheckedChange={() => column.setFilterValue(value)}
							>
								{label()}
							</DropdownMenuCheckboxItem>
						))}
					</DropdownMenuContent>
				</DropdownMenu>
			),
			cell: ({ row }) => <LifecycleChip lifecycle={row.original.lifecycle} />,
		}),
		matchColumnHelper.display({
			id: "updated",
			size: DEFAULT_COLUMN_SIZING.updated,
			minSize: 96,
			enableSorting: true,
			header: ({ column }) => {
				const sorted = column.getIsSorted();
				return (
					<SortHeader
						label={m["enrichment.col_updated"]()}
						active={Boolean(sorted)}
						direction={sorted === "asc" ? "asc" : "desc"}
						onClick={(event) => column.toggleSorting(undefined, event.shiftKey)}
						sortIndex={column.getSortIndex()}
					/>
				);
			},
			cell: ({ row }) => (
				<span className="truncate text-muted-foreground text-xs tabular-nums">
					{row.original.lastRunAt
						? formatRelativeTime(row.original.lastRunAt)
						: m["enrichment.never_ran"]()}
				</span>
			),
		}),
		matchColumnHelper.display({
			id: "actions",
			size: DEFAULT_COLUMN_SIZING.actions,
			enableHiding: false,
			enableResizing: false,
			cell: ({ row }) => {
				const item = row.original;
				const actions = rowActions(item);
				return (
					<>
						<PrimaryRowButton
							lifecycle={item.lifecycle}
							actions={actions}
							onOpen={() => openDetail(item)}
						/>
						<RowMenu lifecycle={item.lifecycle} actions={actions} />
					</>
				);
			},
		}),
	]);
	const paginationState = {
		pageIndex: page - 1,
		pageSize: PAGE_SIZE,
	};
	const sortingState = parseEnrichmentSort(sort).map(
		({ field, direction }) => ({
			id: field === "title" ? "book" : "updated",
			desc: direction === "desc",
		}),
	);
	const columnFiltersState: ColumnFiltersState = [
		...(search ? [{ id: "book", value: search }] : []),
		...(lifecycle ? [{ id: "status", value: lifecycle }] : []),
	];
	const matchTable = useTable({
		features: MATCH_TABLE_FEATURES,
		data: items,
		columns: matchColumns,
		getRowId: (row) => row.bookUuid,
		rowCount: total,
		columnResizeMode: "onEnd",
		enableRowSelection: true,
		manualFiltering: true,
		manualPagination: true,
		manualSorting: true,
		onColumnFiltersChange: (updater) => {
			const next = functionalUpdate(updater, columnFiltersState);
			const nextSearch = String(
				next.find(({ id }) => id === "book")?.value ?? "",
			);
			const nextLifecycle = next.find(({ id }) => id === "status")?.value as
				| Lifecycle
				| undefined;
			if (nextSearch !== search) setSearch(nextSearch);
			if (nextLifecycle !== lifecycle) {
				applyScope({
					bucket: nextLifecycle ? LIFECYCLE_BUCKET[nextLifecycle] : bucket,
					lifecycle: nextLifecycle,
				});
			}
		},
		onColumnOrderChange: setColumnOrder,
		onColumnPinningChange: setColumnPinning,
		onColumnSizingChange: setColumnSizing,
		onPaginationChange: (updater) => {
			const next = functionalUpdate(updater, paginationState);
			const nextPage = next.pageIndex + 1;
			onPageChange(nextPage);
		},
		onRowSelectionChange: setRowSelection,
		onSortingChange: (updater) => {
			const next = functionalUpdate(updater, sortingState).slice(0, 2);
			const nextSort = (next
				.map(
					({ id, desc }) =>
						`${id === "book" ? "title" : "updated"}.${desc ? "desc" : "asc"}`,
				)
				.join(",") || "updated.desc") as Sort;
			patchFilters(
				{ sort: nextSort === "updated.desc" ? undefined : nextSort },
				{ keepSelection: true },
			);
		},
		state: {
			columnFilters: columnFiltersState,
			columnOrder,
			columnPinning,
			columnSizing,
			pagination: paginationState,
			rowSelection,
			sorting: sortingState,
		},
	});
	const tableRows = matchTable.getRowModel().rows;
	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);
	const reorderColumns = ({ active, over }: DragEndEvent) => {
		if (!over || active.id === over.id) return;
		setColumnOrder((current) => {
			const from = current.indexOf(String(active.id));
			const to = current.indexOf(String(over.id));
			return from < 1 || to < 1 || to >= current.length - 1
				? current
				: arrayMove(current, from, to);
		});
	};
	const tableGridStyle: CSSProperties = {
		gridTemplateColumns: matchTable
			.getVisibleLeafColumns()
			.map((column) =>
				column.id === "book" || column.id === "match"
					? `minmax(${column.getSize()}px, ${column.id === "book" ? 1.7 : 1}fr)`
					: `${column.getSize()}px`,
			)
			.join(" "),
		minWidth: matchTable.getTotalSize(),
		width: "100%",
	};

	return { matchTable, tableRows, sensors, reorderColumns, tableGridStyle };
}
// Dense CRM grid: the outer wrapper owns the column template, the header and
// every row are subgrids of it, and the list itself is `contents` so rows
// participate directly. Track 1 is the checkbox gutter, tracks 2–5 are the
// content columns (owned by one row button, so the row stays a single tab
// stop with no nested buttons), track 6 is the row menu.
export const TABLE_GRID =
	"grid min-w-[860px] grid-cols-[2.5rem_minmax(0,1.7fr)_minmax(0,1fr)_9.5rem_7rem_8.5rem]";
export const ROW_SUBGRID = "col-span-full grid grid-cols-subgrid items-center";

function SortableMatchHeader({
	header,
	content,
}: {
	header: Header<typeof MATCH_TABLE_FEATURES, MatchRow, unknown>;
	content: ReactNode;
}) {
	const locked =
		header.column.id === "select" || header.column.id === "actions";
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: header.column.id, disabled: locked });
	return (
		<th
			ref={setNodeRef}
			scope="col"
			{...(locked ? {} : attributes)}
			{...(locked ? {} : listeners)}
			className={cn(
				"relative flex h-[38px] items-center bg-background px-1.5",
				!locked && "cursor-grab touch-none active:cursor-grabbing",
				header.column.id === "select" && "justify-center",
				(header.column.id === "match" || header.column.id === "status") &&
					"font-medium text-xs",
				isDragging && "shadow-lg",
			)}
			style={{
				...pinnedColumnStyle(header.column),
				backgroundColor: "var(--background)",
				transform: CSS.Translate.toString(transform),
				transition,
				zIndex: isDragging ? 40 : 30,
			}}
		>
			{content}
			{header.column.getCanResize() && (
				<button
					type="button"
					aria-label={m["enrichment.resize_column"]()}
					onPointerDown={(event) => event.stopPropagation()}
					onDoubleClick={() => header.column.resetSize()}
					onMouseDown={header.getResizeHandler()}
					onTouchStart={header.getResizeHandler()}
					className={cn(
						"absolute inset-y-1 end-0 z-20 w-1 cursor-col-resize touch-none rounded-full hover:bg-primary/50",
						header.column.getIsResizing() && "bg-primary",
					)}
				/>
			)}
		</th>
	);
}

function pinnedColumnStyle(column: {
	getAfter: (position?: "end") => number;
	getIsPinned: () => false | "start" | "end";
	getStart: (position?: "start") => number;
}): CSSProperties {
	const pinned = column.getIsPinned();
	if (!pinned) return {};
	return {
		position: "sticky",
		insetInlineStart: pinned === "start" ? column.getStart("start") : undefined,
		insetInlineEnd: pinned === "end" ? column.getAfter("end") : undefined,
		zIndex: 10,
	};
}

function SortHeader({
	label,
	active,
	direction,
	onClick,
	sortIndex,
	className,
}: {
	label: string;
	active: boolean;
	direction: "asc" | "desc";
	onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
	sortIndex?: number;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"inline-flex w-fit items-center gap-1 text-xs transition-colors hover:text-foreground",
				active ? "font-medium text-foreground" : "font-normal",
				className,
			)}
		>
			{label}
			<IconSwap
				className="size-3"
				active={active ? direction : "none"}
				icons={{
					asc: <CaretUp weight="bold" className="size-3" />,
					desc: <CaretDown weight="bold" className="size-3" />,
					none: <ArrowsDownUp className="size-3 opacity-50" />,
				}}
			/>
			{active && sortIndex != null && sortIndex > 0 && (
				<span className="text-[10px] text-muted-foreground tabular-nums">
					{sortIndex + 1}
				</span>
			)}
		</button>
	);
}

export function MatchResults({
	table,
	desktopTable,
	scopeLabel,
	isPlaceholderData,
	selectAllFilter,
	detailUuid,
	openDetail,
	rowActions,
	providerLabels,
	setSelectAllFilter,
}: {
	table: ReturnType<typeof useMatchTable>;
	desktopTable: boolean;
	scopeLabel: string;
	isPlaceholderData: boolean;
	selectAllFilter: boolean;
	detailUuid: string | null;
	openDetail: MatchTableOptions["openDetail"];
	rowActions: MatchTableOptions["rowActions"];
	providerLabels: Record<string, string>;
	setSelectAllFilter: (value: boolean) => void;
}) {
	const { matchTable, tableRows, sensors, reorderColumns, tableGridStyle } =
		table;
	const toggleRowSelection = (uuid: string) => {
		setSelectAllFilter(false);
		matchTable.getRow(uuid).toggleSelected();
	};
	return desktopTable ? (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragEnd={reorderColumns}
		>
			<table
				aria-label={scopeLabel}
				className={cn(
					"grid border-spacing-0 transition-opacity",
					isPlaceholderData && "pointer-events-none opacity-50",
				)}
				style={tableGridStyle}
			>
				<thead className="contents">
					{matchTable.getHeaderGroups().map((headerGroup) => (
						<tr
							key={headerGroup.id}
							className={cn(
								ROW_SUBGRID,
								"sticky top-0 isolate z-30 border-border/60 border-b bg-background px-3 text-muted-foreground",
							)}
						>
							<SortableContext
								items={headerGroup.headers.map(({ column }) => column.id)}
								strategy={horizontalListSortingStrategy}
							>
								{headerGroup.headers.map((header) => (
									<SortableMatchHeader
										key={header.id}
										header={header}
										content={
											header.isPlaceholder ? null : (
												<matchTable.FlexRender header={header} />
											)
										}
									/>
								))}
							</SortableContext>
						</tr>
					))}
				</thead>
				<tbody className="contents">
					{tableRows.map((row) => (
						<EnrichmentRow
							key={row.id}
							item={row.original}
							cells={row.getVisibleCells().map((cell) => ({
								id: cell.column.id,
								content: <matchTable.FlexRender cell={cell} />,
								style: pinnedColumnStyle(cell.column),
							}))}
							selected={row.getIsSelected() || selectAllFilter}
							open={row.id === detailUuid}
							onOpen={() => openDetail(row.original)}
						/>
					))}
				</tbody>
			</table>
		</DndContext>
	) : (
		<ul className={cn(isPlaceholderData && "pointer-events-none opacity-50")}>
			{matchTable.getRowModel().rows.map((row) => (
				<EnrichmentCard
					key={row.id}
					item={row.original}
					selected={row.getIsSelected() || selectAllFilter}
					open={row.id === detailUuid}
					onToggle={() => toggleRowSelection(row.id)}
					onOpen={() => openDetail(row.original)}
					providerLabels={providerLabels}
					actions={rowActions(row.original)}
				/>
			))}
		</ul>
	);
}
