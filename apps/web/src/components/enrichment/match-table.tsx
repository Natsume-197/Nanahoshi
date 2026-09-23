import {
	ArrowsDownUp,
	CaretDown,
	CaretUp,
	FunnelSimple,
} from "@phosphor-icons/react";
import {
	type ColumnFiltersState,
	columnFilteringFeature,
	createColumnHelper,
	functionalUpdate,
	type RowSelectionState,
	rowPaginationFeature,
	rowSelectionFeature,
	rowSortingFeature,
	tableFeatures,
	useTable,
} from "@tanstack/react-table";
import type { Dispatch, SetStateAction } from "react";
import { type MouseEvent as ReactMouseEvent, useRef, useState } from "react";
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
import {
	type BucketFilter,
	LIFECYCLE_BUCKET,
	type EnrichmentLifecycle as Lifecycle,
	PAGE_SIZE,
	parseEnrichmentSort,
	type EnrichmentSort as Sort,
} from "./filters";
import { LIFECYCLE_LABELS } from "./lifecycle";
import { IconSwap } from "./match-controls";
import {
	createRowMenuHandle,
	EnrichmentCard,
	EnrichmentRow,
	type RowHandlers,
	SharedRowMenu,
} from "./match-rows";
import type { ScopeSelection } from "./match-sidebar";
import { TrayHeaderCell, TrayTable } from "./tray-table";
import type { MatchRow, RowActions } from "./types";

const MATCH_TABLE_FEATURES = tableFeatures({
	columnFilteringFeature,
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

// The outer wrapper owns the column template; header and rows are subgrids of
// it. Status, date and actions size to their widest cell so a long chip or a
// "Fix match" button never spills into the neighbouring column.
export const TABLE_GRID =
	"grid min-w-[760px] grid-cols-[2.5rem_minmax(14rem,1.7fr)_minmax(11rem,1fr)_auto_auto_auto]";
export { TRAY_ROW_SUBGRID as ROW_SUBGRID } from "./tray-table";

type MatchTableOptions = {
	onPageChange: (page: number) => void;
	items: MatchRow[];
	total: number;
	page: number;
	sort?: Sort;
	search: string;
	lifecycle?: Lifecycle;
	bucket: BucketFilter;
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

// Rows are memoized, so they need handlers whose identity never changes; the
// ref forwards each call to the latest closures from the parent render.
function useStableRowHandlers(latest: {
	openDetail: (item: MatchRow) => void;
	rowActions: (item: MatchRow) => RowActions;
	toggle: (uuid: string) => void;
}): RowHandlers {
	const ref = useRef(latest);
	ref.current = latest;
	const [handlers] = useState<RowHandlers>(() => ({
		menu: createRowMenuHandle(),
		open: (item) => ref.current.openDetail(item),
		toggle: (uuid) => ref.current.toggle(uuid),
		actions: (item) => ({
			onRetry: () => ref.current.rowActions(item).onRetry(),
			onRefresh: () => ref.current.rowActions(item).onRefresh(),
			onCancelRetry: () => ref.current.rowActions(item).onCancelRetry(),
			onApprove: () => ref.current.rowActions(item).onApprove(),
			onFix: () => ref.current.rowActions(item).onFix(),
			onSelectCandidate: (candidate) =>
				ref.current.rowActions(item).onSelectCandidate(candidate),
		}),
	}));
	return handlers;
}

export function useMatchTable({
	items,
	total,
	page,
	sort,
	search,
	lifecycle,
	bucket,
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
	// Only headers live here: rows render through the memoized EnrichmentRow so
	// toggling one checkbox re-renders one row, not the whole page.
	const matchColumns = matchColumnHelper.columns([
		matchColumnHelper.display({
			id: "select",
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
		}),
		matchColumnHelper.display({
			id: "book",
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
		}),
		matchColumnHelper.display({
			id: "match",
			header: () => m["enrichment.col_match"](),
		}),
		matchColumnHelper.display({
			id: "status",
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
		}),
		matchColumnHelper.display({
			id: "updated",
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
		}),
		matchColumnHelper.display({ id: "actions" }),
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
		onPaginationChange: (updater) => {
			const next = functionalUpdate(updater, paginationState);
			onPageChange(next.pageIndex + 1);
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
			pagination: paginationState,
			rowSelection,
			sorting: sortingState,
		},
	});
	const tableRows = matchTable.getRowModel().rows;
	const rowHandlers = useStableRowHandlers({
		openDetail,
		rowActions,
		toggle: (uuid) => {
			setSelectAllFilter(false);
			setRowSelection((current) => {
				const { [uuid]: selected, ...rest } = current;
				return selected ? rest : { ...current, [uuid]: true };
			});
		},
	});

	return { matchTable, tableRows, rowHandlers };
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
	providerLabels,
}: {
	table: ReturnType<typeof useMatchTable>;
	desktopTable: boolean;
	scopeLabel: string;
	isPlaceholderData: boolean;
	selectAllFilter: boolean;
	detailUuid: string | null;
	providerLabels: Record<string, string>;
}) {
	const { matchTable, tableRows, rowHandlers } = table;
	const results = desktopTable ? (
		<TrayTable
			label={scopeLabel}
			gridClassName={TABLE_GRID}
			dimmed={isPlaceholderData}
			header={matchTable.getHeaderGroups()[0]?.headers.map((header) => (
				<TrayHeaderCell
					key={header.id}
					className={cn(
						header.column.id === "select" && "justify-center",
						(header.column.id === "book" || header.column.id === "updated") &&
							"font-normal",
					)}
				>
					{header.isPlaceholder ? null : (
						<matchTable.FlexRender header={header} />
					)}
				</TrayHeaderCell>
			))}
		>
			{tableRows.map((row) => (
				<EnrichmentRow
					key={row.id}
					item={row.original}
					selected={row.getIsSelected() || selectAllFilter}
					open={row.id === detailUuid}
					providerLabels={providerLabels}
					handlers={rowHandlers}
				/>
			))}
		</TrayTable>
	) : (
		<ul className={cn(isPlaceholderData && "pointer-events-none opacity-50")}>
			{tableRows.map((row) => (
				<EnrichmentCard
					key={row.id}
					item={row.original}
					selected={row.getIsSelected() || selectAllFilter}
					open={row.id === detailUuid}
					providerLabels={providerLabels}
					handlers={rowHandlers}
				/>
			))}
		</ul>
	);
	return (
		<>
			{results}
			<SharedRowMenu handlers={rowHandlers} />
		</>
	);
}
