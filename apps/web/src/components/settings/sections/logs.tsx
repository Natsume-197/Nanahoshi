import type {
	LogEntry,
	LogLevel,
	LogSource,
} from "@nanahoshi-v2/api/lib/log-buffer";
import {
	ArrowsClockwise,
	ArrowsLeftRight,
	BracketsCurly,
	DotsThree,
	ListMagnifyingGlass,
	MagnifyingGlass,
	WarningCircle,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	DataTable,
	DataTableColumnHeader,
	type DataTableFeatures,
	dataTableFeatures,
} from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatDetailedDate } from "@/utils/format";
import { orpc } from "@/utils/orpc";

type LevelFilter = "all" | LogLevel;
type SourceFilter = "all" | LogSource;

const LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

const levelVariant = {
	trace: "outline",
	debug: "secondary",
	info: "info",
	warn: "warning",
	error: "destructive",
	fatal: "destructive",
} as const;

const levelLabels: Record<LogLevel, () => string> = {
	trace: m["settings.logs.level_trace"],
	debug: m["settings.logs.level_debug"],
	info: m["settings.logs.level_info"],
	warn: m["settings.logs.level_warn"],
	error: m["settings.logs.level_error"],
	fatal: m["settings.logs.level_fatal"],
};

const sourceLabels: Record<LogSource, () => string> = {
	server: m["settings.logs.source_server"],
	worker: m["settings.logs.source_worker"],
};

export function normalizeLogSource(source: unknown): LogSource {
	return source === "worker" ? "worker" : "server";
}

export function filterLogEntries(
	entries: LogEntry[],
	filters: { query: string; level: LevelFilter; source: SourceFilter },
): LogEntry[] {
	const normalizedQuery = filters.query.trim().toLocaleLowerCase();
	return entries
		.map((entry) => ({
			...entry,
			source: normalizeLogSource(entry.source),
		}))
		.filter((entry) => {
			if (filters.level !== "all" && entry.level !== filters.level) {
				return false;
			}
			if (filters.source !== "all" && entry.source !== filters.source) {
				return false;
			}
			if (!normalizedQuery) return true;
			return `${entry.message} ${JSON.stringify(entry.context)}`
				.toLocaleLowerCase()
				.includes(normalizedQuery);
		});
}

function hasContext(entry: LogEntry): boolean {
	return Object.keys(entry.context).length > 0;
}

export function LogSourceBadge({ source }: { source: unknown }) {
	const normalizedSource = normalizeLogSource(source);
	return (
		<Badge variant={normalizedSource === "worker" ? "outline" : "secondary"}>
			{sourceLabels[normalizedSource]()}
		</Badge>
	);
}

export function LogLevelBadge({ level }: { level: LogLevel }) {
	return (
		<Badge
			variant={levelVariant[level]}
			className={cn(
				(level === "error" || level === "fatal") && "text-foreground",
			)}
		>
			{levelLabels[level]()}
		</Badge>
	);
}

const helper = createColumnHelper<DataTableFeatures, LogEntry>();

function logColumns({
	onViewContext,
}: {
	onViewContext: (entry: LogEntry, returnFocus: () => void) => void;
}) {
	return helper.columns([
		helper.accessor("timestamp", {
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={m["settings.logs.date"]()}
				/>
			),
			cell: ({ row }) => (
				<time
					dateTime={row.original.timestamp}
					className="text-muted-foreground text-xs tabular-nums"
				>
					{formatDetailedDate(new Date(row.original.timestamp))}
				</time>
			),
		}),
		helper.accessor("source", {
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={m["settings.logs.source"]()}
				/>
			),
			cell: ({ row }) => <LogSourceBadge source={row.original.source} />,
		}),
		helper.accessor("level", {
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={m["settings.logs.level"]()}
				/>
			),
			cell: ({ row }) => <LogLevelBadge level={row.original.level} />,
		}),
		helper.accessor("message", {
			header: ({ column }) => (
				<DataTableColumnHeader
					column={column}
					title={m["settings.logs.message"]()}
				/>
			),
			cell: ({ row }) => (
				<p className="min-w-56 max-w-xl whitespace-normal break-words font-mono text-[13px] leading-relaxed">
					{row.original.message || m["settings.logs.no_message"]()}
				</p>
			),
		}),
		helper.display({
			id: "actions",
			header: () => (
				<span className="sr-only">{m["settings.logs.actions"]()}</span>
			),
			cell: ({ row }) => (
				<LogActionsMenu entry={row.original} onViewContext={onViewContext} />
			),
		}),
	]);
}

function LogActionsMenu({
	entry,
	onViewContext,
}: {
	entry: LogEntry;
	onViewContext: (entry: LogEntry, returnFocus: () => void) => void;
}) {
	const triggerRef = useRef<HTMLButtonElement>(null);

	return (
		<div className="flex justify-end">
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						ref={triggerRef}
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={m["settings.logs.actions_for"]({
							message: entry.message || m["settings.logs.no_message"](),
						})}
					>
						<DotsThree aria-hidden="true" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end">
					<DropdownMenuGroup>
						<DropdownMenuItem
							disabled={!hasContext(entry)}
							onClick={() =>
								onViewContext(entry, () => triggerRef.current?.focus())
							}
						>
							<BracketsCurly aria-hidden="true" />
							{m["settings.logs.view_context"]()}
						</DropdownMenuItem>
					</DropdownMenuGroup>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}

export function AdminLogs() {
	const [query, setQuery] = useState("");
	const [level, setLevel] = useState<LevelFilter>("all");
	const [source, setSource] = useState<SourceFilter>("all");
	const [contextEntry, setContextEntry] = useState<LogEntry | null>(null);
	const [contextOpen, setContextOpen] = useState(false);
	const contextReturnFocusRef = useRef<(() => void) | null>(null);
	const listLogsOptions = orpc.settings.listLogs.queryOptions();
	const logsQuery = useQuery({
		...listLogsOptions,
		queryKey: [...listLogsOptions.queryKey, { schemaVersion: 2 }],
		staleTime: Number.POSITIVE_INFINITY,
	});

	const filteredLogs = useMemo(() => {
		return filterLogEntries(logsQuery.data ?? [], { query, level, source });
	}, [level, logsQuery.data, query, source]);
	const hasActiveFilters =
		query.trim() !== "" || level !== "all" || source !== "all";
	const clearFilters = useCallback(() => {
		setQuery("");
		setLevel("all");
		setSource("all");
	}, []);
	const handleViewContext = useCallback(
		(entry: LogEntry, returnFocus: () => void) => {
			contextReturnFocusRef.current = returnFocus;
			setContextEntry(entry);
			setContextOpen(true);
		},
		[],
	);
	const columns = useMemo(
		() => logColumns({ onViewContext: handleViewContext }),
		[handleViewContext],
	);

	return (
		<section className="flex flex-col gap-6" aria-labelledby="logs-title">
			<div className="flex flex-col gap-1">
				<h2
					id="logs-title"
					className="text-balance font-semibold text-foreground text-xl"
				>
					{m["settings.logs.title"]()}
				</h2>
				<p className="max-w-3xl text-pretty text-muted-foreground text-sm leading-relaxed">
					{m["settings.logs.desc"]()}
				</p>
			</div>

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(16rem,1fr)_minmax(10rem,auto)_minmax(10rem,auto)_auto] lg:items-end">
				<div className="flex min-w-0 flex-col gap-2 sm:col-span-2 lg:col-span-1">
					<Label htmlFor="log-search">{m["settings.logs.search"]()}</Label>
					<div className="relative">
						<MagnifyingGlass
							aria-hidden="true"
							className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							id="log-search"
							type="search"
							name="log-search"
							autoComplete="off"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
							placeholder={m["settings.logs.search_placeholder"]()}
							className="w-full ps-9"
						/>
					</div>
				</div>

				<div className="flex min-w-0 flex-col gap-2">
					<Label id="log-level-label">
						{m["settings.logs.filter_level"]()}
					</Label>
					<Select<LevelFilter> value={level} onValueChange={setLevel}>
						<SelectTrigger
							id="log-level"
							aria-labelledby="log-level-label"
							className="w-full"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">
								{m["settings.logs.all_levels"]()}
							</SelectItem>
							{LEVELS.map((value) => (
								<SelectItem key={value} value={value}>
									{levelLabels[value]()}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<div className="flex min-w-0 flex-col gap-2">
					<Label id="log-source-label">
						{m["settings.logs.filter_source"]()}
					</Label>
					<Select<SourceFilter> value={source} onValueChange={setSource}>
						<SelectTrigger
							id="log-source"
							aria-labelledby="log-source-label"
							className="w-full"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">
								{m["settings.logs.all_sources"]()}
							</SelectItem>
							<SelectItem value="server">{sourceLabels.server()}</SelectItem>
							<SelectItem value="worker">{sourceLabels.worker()}</SelectItem>
						</SelectContent>
					</Select>
				</div>

				<Button
					type="button"
					variant="outline"
					className="w-full sm:w-fit"
					onClick={() => logsQuery.refetch()}
					disabled={logsQuery.isFetching}
				>
					<ArrowsClockwise
						data-icon="inline-start"
						className={cn(logsQuery.isFetching && "animate-spin")}
					/>
					{m["settings.logs.refresh"]()}
				</Button>
			</div>

			<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-pretty text-muted-foreground text-xs leading-relaxed">
					{m["settings.logs.retention_note"]()}
				</p>
				<div className="flex items-center gap-2">
					<p
						className="text-muted-foreground text-xs tabular-nums"
						role="status"
						aria-live="polite"
					>
						{logsQuery.isFetching
							? m["settings.logs.refreshing"]()
							: m["settings.logs.results"]({
									visible: filteredLogs.length,
									total: logsQuery.data?.length ?? 0,
								})}
					</p>
					{hasActiveFilters && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={clearFilters}
						>
							{m["settings.logs.clear_filters"]()}
						</Button>
					)}
				</div>
			</div>

			<p className="flex items-center gap-1.5 text-muted-foreground text-xs sm:hidden">
				<ArrowsLeftRight aria-hidden="true" className="size-4 shrink-0" />
				{m["settings.logs.scroll_hint"]()}
			</p>

			<div aria-busy={logsQuery.isFetching}>
				{logsQuery.isError ? (
					<div
						className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl bg-muted/40 px-6 text-center"
						role="alert"
					>
						<WarningCircle
							aria-hidden="true"
							className="size-6 text-destructive"
						/>
						<div className="space-y-1">
							<p className="font-medium text-foreground text-sm">
								{m["settings.logs.load_failed"]()}
							</p>
							<p className="text-muted-foreground text-sm">
								{m["settings.logs.load_failed_desc"]()}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => logsQuery.refetch()}
						>
							{m["settings.logs.retry"]()}
						</Button>
					</div>
				) : (
					<DataTable
						features={dataTableFeatures}
						tableLabel={m["settings.logs.table_label"]()}
						columns={columns}
						data={filteredLogs}
						getRowId={(entry) => entry.id}
						isLoading={logsQuery.isLoading}
						pageSize={25}
						paginationLabels={{
							page: (page, pageCount) =>
								m["settings.logs.page"]({ page, pageCount }),
							previous: m["settings.logs.previous_page"](),
							next: m["settings.logs.next_page"](),
						}}
						emptyState={{
							icon: (
								<ListMagnifyingGlass
									aria-hidden="true"
									className="size-5 text-muted-foreground"
								/>
							),
							title: m["settings.logs.empty"](),
							description: m["settings.logs.empty_desc"](),
							action: (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={
										hasActiveFilters ? clearFilters : () => logsQuery.refetch()
									}
								>
									{hasActiveFilters
										? m["settings.logs.clear_filters"]()
										: m["settings.logs.refresh"]()}
								</Button>
							),
						}}
					/>
				)}
			</div>

			<Modal
				open={contextOpen}
				onOpenChange={setContextOpen}
				onOpenChangeComplete={(open) => {
					if (!open) {
						setContextEntry(null);
						contextReturnFocusRef.current?.();
						contextReturnFocusRef.current = null;
					}
				}}
				title={m["settings.logs.context_title"]()}
				description={m["settings.logs.context_description"]()}
				className="sm:max-w-2xl"
			>
				{contextEntry && (
					<div className="mb-4 grid gap-3 rounded-xl bg-muted/50 p-4 sm:grid-cols-[auto_1fr]">
						<dl className="contents text-sm">
							<dt className="font-medium text-muted-foreground">
								{m["settings.logs.date"]()}
							</dt>
							<dd>
								<time
									dateTime={contextEntry.timestamp}
									className="tabular-nums"
								>
									{formatDetailedDate(new Date(contextEntry.timestamp))}
								</time>
							</dd>
							<dt className="font-medium text-muted-foreground">
								{m["settings.logs.source"]()}
							</dt>
							<dd>
								<LogSourceBadge source={contextEntry.source} />
							</dd>
							<dt className="font-medium text-muted-foreground">
								{m["settings.logs.level"]()}
							</dt>
							<dd>
								<LogLevelBadge level={contextEntry.level} />
							</dd>
							<dt className="font-medium text-muted-foreground">
								{m["settings.logs.message"]()}
							</dt>
							<dd className="min-w-0 break-words font-mono text-[13px] leading-relaxed">
								{contextEntry.message || m["settings.logs.no_message"]()}
							</dd>
						</dl>
					</div>
				)}
				<pre
					dir="ltr"
					translate="no"
					className="max-h-[50dvh] overflow-auto overscroll-contain rounded-xl bg-muted p-4 text-[13px] tabular-nums leading-relaxed"
				>
					<code className="whitespace-pre-wrap break-all">
						{JSON.stringify(contextEntry?.context ?? {}, null, 2)}
					</code>
				</pre>
			</Modal>
		</section>
	);
}
