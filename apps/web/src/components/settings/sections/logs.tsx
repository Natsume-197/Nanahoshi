import type { LogLevel, LogSource } from "@nanahoshi-v2/api/lib/log-buffer";
import {
	ArrowDown,
	ArrowElbowDownLeft,
	ArrowsClockwise,
	DownloadSimple,
	MagnifyingGlass,
	TextAlignLeft,
	X,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { downloadFromUrl } from "@/utils/download";
import { formatDetailedDate } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import {
	filterLogEntries,
	formatLogContext,
	formatLogText,
} from "./logs.utils";

const LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];
const levelColors: Record<LogLevel, string> = {
	trace: "text-muted-foreground",
	debug: "text-muted-foreground",
	info: "text-foreground/80",
	warn: "text-amber-600 dark:text-amber-400",
	error: "text-red-600 dark:text-red-400",
	fatal: "text-red-600 dark:text-red-400",
};
const sourceColors: Record<LogSource, string> = {
	server: "text-sky-700 dark:text-sky-300",
	worker: "text-violet-700 dark:text-violet-300",
};
const controlClass =
	"h-9 shrink-0 rounded-md border border-border bg-control px-2 text-sm focus-visible:outline-ring";

export function AdminLogs() {
	const [query, setQuery] = useState("");
	const [level, setLevel] = useState<"all" | LogLevel>("all");
	const [source, setSource] = useState<"all" | LogSource>("all");
	const [date, setDate] = useState("");
	const [limit, setLimit] = useState("500");
	const [follow, setFollow] = useState(true);
	const [wrap, setWrap] = useState(false);
	const viewportRef = useRef<HTMLElement>(null);
	const listLogsOptions = orpc.settings.listLogs.queryOptions();
	const logsQuery = useQuery({
		...listLogsOptions,
		queryKey: [...listLogsOptions.queryKey, { schemaVersion: 2 }],
		refetchInterval: follow ? 3000 : false,
	});
	const filteredLogs = useMemo(
		() =>
			filterLogEntries(logsQuery.data ?? [], { query, level, source, date })
				.slice(0, Number(limit))
				.reverse(),
		[logsQuery.data, query, level, source, date, limit],
	);
	const lastId = filteredLogs.at(-1)?.id;
	useEffect(() => {
		if (follow && lastId && filteredLogs.length > 0) {
			const viewport = viewportRef.current;
			if (viewport) viewport.scrollTop = viewport.scrollHeight;
		}
	}, [follow, lastId, filteredLogs.length]);
	const hasFilters =
		query.trim() !== "" || level !== "all" || source !== "all" || date !== "";
	function exportLogs() {
		const url = URL.createObjectURL(
			new Blob([formatLogText(filteredLogs)], {
				type: "text/plain;charset=utf-8",
			}),
		);
		downloadFromUrl(url, "nanahoshi-logs.txt");
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	}

	return (
		<section
			className="flex min-w-0 flex-col gap-3"
			aria-label={m["settings.logs.title"]()}
		>
			<div className="flex flex-wrap items-center gap-2">
				<div className="relative min-w-48 flex-1">
					<MagnifyingGlass
						aria-hidden="true"
						className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						type="search"
						aria-label={m["settings.logs.search"]()}
						placeholder={m["settings.logs.search_placeholder"]()}
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						className="h-9 rounded-md border-border ps-9"
					/>
				</div>
				<input
					type="date"
					aria-label={m["settings.logs.date"]()}
					value={date}
					onChange={(event) => setDate(event.target.value)}
					className={cn(controlClass, "max-w-36")}
				/>
				<select
					aria-label={m["settings.logs.filter_level"]()}
					value={level}
					onChange={(event) => setLevel(event.target.value as "all" | LogLevel)}
					className={controlClass}
				>
					<option value="all">{m["settings.logs.all_levels"]()}</option>
					{LEVELS.map((value) => (
						<option key={value} value={value}>
							{value.toUpperCase()}
						</option>
					))}
				</select>
				<select
					aria-label={m["settings.logs.filter_source"]()}
					value={source}
					onChange={(event) =>
						setSource(event.target.value as "all" | LogSource)
					}
					className={controlClass}
				>
					<option value="all">{m["settings.logs.all_sources"]()}</option>
					<option value="server">{m["settings.logs.source_server"]()}</option>
					<option value="worker">{m["settings.logs.source_worker"]()}</option>
				</select>
				<select
					aria-label={m["settings.logs.line_limit"]()}
					value={limit}
					onChange={(event) => setLimit(event.target.value)}
					className={controlClass}
				>
					{["100", "500", "1000"].map((value) => (
						<option key={value} value={value}>
							{m["settings.logs.lines"]({ count: Number(value) })}
						</option>
					))}
				</select>
				<div className="flex shrink-0 items-center gap-1">
					<Button
						variant={wrap ? "secondary" : "ghost"}
						size="icon-sm"
						aria-pressed={wrap}
						aria-label={m["settings.logs.wrap"]()}
						title={m["settings.logs.wrap"]()}
						onClick={() => setWrap(!wrap)}
					>
						<ArrowElbowDownLeft />
					</Button>
					<Button
						variant={follow ? "secondary" : "ghost"}
						size="icon-sm"
						aria-pressed={follow}
						aria-label={m["settings.logs.follow"]()}
						title={m["settings.logs.follow"]()}
						onClick={() => setFollow(!follow)}
					>
						<TextAlignLeft />
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={m["settings.logs.refresh"]()}
						title={m["settings.logs.refresh"]()}
						onClick={() => logsQuery.refetch()}
						disabled={logsQuery.isFetching}
					>
						<ArrowsClockwise
							className={cn(logsQuery.isFetching && "animate-spin")}
						/>
					</Button>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={m["common.download"]()}
						title={m["common.download"]()}
						onClick={exportLogs}
						disabled={!filteredLogs.length}
					>
						<DownloadSimple />
					</Button>
					{hasFilters && (
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={m["settings.logs.clear_filters"]()}
							title={m["settings.logs.clear_filters"]()}
							onClick={() => {
								setQuery("");
								setLevel("all");
								setSource("all");
								setDate("");
							}}
						>
							<X />
						</Button>
					)}
				</div>
			</div>
			<div className="relative min-w-0">
				<section
					ref={viewportRef}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: scrollable console needs keyboard focus
					tabIndex={0}
					aria-label={m["settings.logs.table_label"]()}
					aria-busy={logsQuery.isLoading}
					onScroll={(event) => {
						const viewport = event.currentTarget;
						if (
							follow &&
							viewport.scrollHeight -
								viewport.scrollTop -
								viewport.clientHeight >
								40
						)
							setFollow(false);
					}}
					className="h-[calc(100dvh-14rem-var(--desktop-player-offset,0px))] min-h-80 overflow-auto overscroll-contain rounded-xl border bg-muted/20 px-3 py-2 pb-12 font-mono text-[13px] leading-[1.8]"
				>
					{logsQuery.isError && (
						<div role="alert" className="p-6 font-sans">
							<p className="text-destructive">
								{m["settings.logs.load_failed"]()}
							</p>
							<Button variant="outline" onClick={() => logsQuery.refetch()}>
								{m["settings.logs.retry"]()}
							</Button>
						</div>
					)}
					{logsQuery.isLoading ? (
						<p className="p-6">{m["settings.logs.refreshing"]()}</p>
					) : !filteredLogs.length && !logsQuery.isError ? (
						<div className="p-6 font-sans text-muted-foreground">
							<p>{m["settings.logs.empty"]()}</p>
							<p>{m["settings.logs.empty_desc"]()}</p>
						</div>
					) : null}
					{filteredLogs.map((entry) => {
						const context = formatLogContext(entry.context);
						return (
							<div
								key={entry.id}
								className={cn(
									"min-w-full border-border/20 border-b",
									wrap ? "w-full" : "w-max",
									(entry.level === "error" || entry.level === "fatal") &&
										"bg-red-500/10",
									entry.level === "warn" && "bg-amber-500/10",
								)}
							>
								<p
									dir="ltr"
									className={cn(
										wrap
											? "whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
											: "whitespace-pre",
									)}
								>
									<time
										dateTime={entry.timestamp}
										title={formatDetailedDate(new Date(entry.timestamp))}
										className="text-muted-foreground tabular-nums"
									>
										{new Date(entry.timestamp).toLocaleTimeString([], {
											hour12: false,
										})}
									</time>
									{"  "}
									<span
										className={cn(
											"inline-block min-w-[5ch] text-right font-semibold uppercase",
											levelColors[entry.level],
										)}
									>
										{entry.level}
									</span>{" "}
									<span
										className={cn("font-semibold", sourceColors[entry.source])}
									>
										[{entry.source}]
									</span>{" "}
									<span>
										{entry.message || m["settings.logs.no_message"]()}
									</span>
								</p>
								{context && (
									<pre
										dir="ltr"
										translate="no"
										className={cn(
											"text-foreground/85",
											wrap
												? "whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
												: "whitespace-pre",
										)}
									>
										{context}
									</pre>
								)}
							</div>
						);
					})}
				</section>
				{!follow && (
					<Button
						variant="secondary"
						size="sm"
						className="absolute end-4 bottom-4 rounded-full shadow"
						onClick={() => {
							const viewport = viewportRef.current;
							if (viewport) viewport.scrollTop = viewport.scrollHeight;
							setFollow(true);
						}}
					>
						<ArrowDown />
						{m["settings.logs.scroll_bottom"]()}
					</Button>
				)}
			</div>
			<footer className="flex flex-wrap items-center justify-between gap-2 text-muted-foreground text-xs">
				<p>{m["settings.logs.retention_note"]()}</p>
				<span role="status">
					{m["settings.logs.results"]({
						visible: filteredLogs.length,
						total: logsQuery.data?.length ?? 0,
					})}
				</span>
			</footer>
		</section>
	);
}
