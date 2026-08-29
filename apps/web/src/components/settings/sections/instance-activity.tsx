import {
	ArrowsClockwise,
	BookOpen,
	Buildings,
	CaretLeft,
	CaretRight,
	CheckCircle,
	Desktop,
	DownloadSimple,
	Funnel,
	Headphones,
	MagnifyingGlass,
	MonitorPlay,
	SignOut,
	User,
	X,
} from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
	DataTable,
	DataTableColumnHeader,
	type DataTableFeatures,
	dataTableFeatures,
} from "@/components/data-table";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { useGatewayChannel } from "@/lib/gateway/use-gateway-channel";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatDetailedDate } from "@/utils/format";
import { client, orpc, queryClient } from "@/utils/orpc";

type OutcomeFilter = "all" | "success" | "failure";

function eventLabel(eventType: string) {
	const labels: Record<string, () => string> = {
		sign_in: m["settings.activity.event_sign_in"],
		sign_out: m["settings.activity.event_sign_out"],
		session_revoked: m["settings.activity.event_session_revoked"],
		password_changed: m["settings.activity.event_password_changed"],
		role_changed: m["settings.activity.event_role_changed"],
	};
	return labels[eventType]?.() ?? eventType;
}

function sourceLabel(source: string) {
	return source === "oauth" ? "OAuth" : source.toUpperCase();
}

function progressLabel(progress: number | null) {
	return progress === null
		? "—"
		: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%`;
}

type SecurityAuditEntry = {
	id: number;
	createdAt: string;
	eventType: string;
	outcome: "success" | "failure";
	subjectName: string | null;
	subjectIdentifier: string | null;
	subjectUserId: string | null;
	device: string | null;
	ipAddress: string | null;
	serverName: string | null;
	serverId: string | null;
	source: string;
};

type DownloadHistoryEntry = {
	id: number;
	createdAt: string;
	deliveryKind: "ebook" | "audiobook" | "audio_file" | "series";
	source: "web" | "opds" | "api";
	userId: string;
	userName: string | null;
	serverId: string;
	serverName: string | null;
	itemTitle: string;
	filename: string;
	fileCount: number;
	device: string | null;
	ipAddress: string | null;
};

function deliveryKindLabel(kind: DownloadHistoryEntry["deliveryKind"]) {
	const labels = {
		ebook: m["settings.activity.download_kind_ebook"],
		audiobook: m["settings.activity.download_kind_audiobook"],
		audio_file: m["settings.activity.download_kind_audio_file"],
		series: m["settings.activity.download_kind_series"],
	};
	return labels[kind]();
}

const downloadColumnHelper = createColumnHelper<
	DataTableFeatures,
	DownloadHistoryEntry
>();

const downloadColumns = downloadColumnHelper.columns([
	downloadColumnHelper.accessor("createdAt", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.time"]()}
			/>
		),
		cell: ({ row }) => (
			<time
				dateTime={row.original.createdAt}
				className="text-muted-foreground text-xs tabular-nums"
			>
				{formatDetailedDate(row.original.createdAt)}
			</time>
		),
	}),
	downloadColumnHelper.accessor("userName", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.user"]()}
			/>
		),
		cell: ({ row }) => (
			<span className="block max-w-40 truncate font-medium">
				{row.original.userName ?? row.original.userId}
			</span>
		),
	}),
	downloadColumnHelper.accessor("itemTitle", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.download_item"]()}
			/>
		),
		cell: ({ row }) => (
			<span className="block max-w-56 truncate font-medium">
				{row.original.itemTitle}
			</span>
		),
	}),
	downloadColumnHelper.accessor("deliveryKind", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.download_type"]()}
			/>
		),
		cell: ({ row }) => (
			<Badge variant="outline">
				{deliveryKindLabel(row.original.deliveryKind)}
			</Badge>
		),
	}),
	downloadColumnHelper.accessor("filename", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.download_file"]()}
			/>
		),
		cell: ({ row }) => (
			<div className="max-w-56">
				<p className="truncate text-sm">{row.original.filename}</p>
				{row.original.fileCount > 1 && (
					<p className="text-muted-foreground text-xs">
						{m["settings.activity.download_files"]({
							count: row.original.fileCount,
						})}
					</p>
				)}
			</div>
		),
	}),
	downloadColumnHelper.display({
		id: "request",
		header: () => m["settings.activity.device"](),
		cell: ({ row }) => (
			<div className="max-w-48 text-muted-foreground text-xs">
				<p className="truncate">{row.original.device ?? "—"}</p>
				<p className="truncate font-mono">{row.original.ipAddress ?? "—"}</p>
			</div>
		),
	}),
	downloadColumnHelper.accessor("serverName", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.server"]()}
			/>
		),
		cell: ({ row }) => (
			<span className="block max-w-36 truncate text-muted-foreground">
				{row.original.serverName ?? row.original.serverId}
			</span>
		),
	}),
	downloadColumnHelper.accessor("source", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.source"]()}
			/>
		),
		cell: ({ row }) => (
			<Badge variant="outline">{sourceLabel(row.original.source)}</Badge>
		),
	}),
]);

const auditColumnHelper = createColumnHelper<
	DataTableFeatures,
	SecurityAuditEntry
>();

const auditColumns = auditColumnHelper.columns([
	auditColumnHelper.accessor("createdAt", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.time"]()}
			/>
		),
		cell: ({ row }) => (
			<time
				dateTime={row.original.createdAt}
				className="text-muted-foreground text-xs tabular-nums"
			>
				{formatDetailedDate(row.original.createdAt)}
			</time>
		),
	}),
	auditColumnHelper.accessor("eventType", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.event"]()}
			/>
		),
		cell: ({ row }) => (
			<span className="font-medium">{eventLabel(row.original.eventType)}</span>
		),
	}),
	auditColumnHelper.accessor("outcome", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.result"]()}
			/>
		),
		cell: ({ row }) => (
			<Badge
				variant={row.original.outcome === "success" ? "success" : "destructive"}
			>
				{row.original.outcome === "success"
					? m["settings.activity.success"]()
					: m["settings.activity.failure"]()}
			</Badge>
		),
	}),
	auditColumnHelper.accessor("subjectName", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.subject"]()}
			/>
		),
		cell: ({ row }) => (
			<span className="block max-w-48 truncate">
				{row.original.subjectName ??
					row.original.subjectIdentifier ??
					row.original.subjectUserId ??
					"—"}
			</span>
		),
	}),
	auditColumnHelper.accessor("device", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.device"]()}
			/>
		),
		cell: ({ row }) => (
			<span className="block max-w-52 truncate text-muted-foreground">
				{row.original.device ?? "—"}
			</span>
		),
	}),
	auditColumnHelper.accessor("ipAddress", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.ip"]()}
			/>
		),
		cell: ({ row }) => (
			<span className="font-mono text-xs">{row.original.ipAddress ?? "—"}</span>
		),
	}),
	auditColumnHelper.accessor("serverName", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.server"]()}
			/>
		),
		cell: ({ row }) => (
			<span className="block max-w-36 truncate text-muted-foreground">
				{row.original.serverName ?? row.original.serverId ?? "—"}
			</span>
		),
	}),
	auditColumnHelper.accessor("source", {
		header: ({ column }) => (
			<DataTableColumnHeader
				column={column}
				title={m["settings.activity.source"]()}
			/>
		),
		cell: ({ row }) => (
			<Badge variant="outline">{sourceLabel(row.original.source)}</Badge>
		),
	}),
]);

export function InstanceActivitySettings() {
	const [outcome, setOutcome] = useState<OutcomeFilter>("all");
	const [userId, setUserId] = useState("");
	const [device, setDevice] = useState("");
	const [serverId, setServerId] = useState("");
	const filters = useMemo(
		() => ({
			outcome: outcome === "all" ? undefined : outcome,
			userId: userId.trim() || undefined,
			device: device.trim() || undefined,
			serverId: serverId.trim() || undefined,
			limit: 100,
		}),
		[device, outcome, serverId, userId],
	);
	const activityOptions = orpc.instanceActivity.list.queryOptions(filters);
	const activityQuery = useQuery(activityOptions);

	useGatewayChannel("instance-activity", () => {
		void queryClient.invalidateQueries({ queryKey: activityOptions.queryKey });
	});

	const revokeMutation = useMutation({
		mutationFn: (sessionId: string) =>
			client.instanceActivity.revokeSession({ sessionId }),
		onSuccess: () => {
			toast.success(m["settings.activity.revoke_success"]());
			void queryClient.invalidateQueries({
				queryKey: activityOptions.queryKey,
			});
		},
		onError: () => toast.error(m["settings.activity.revoke_failed"]()),
	});

	const clearFilters = () => {
		setOutcome("all");
		setUserId("");
		setDevice("");
		setServerId("");
	};
	const active = activityQuery.data?.activePlayback ?? [];
	const audit: SecurityAuditEntry[] = (activityQuery.data?.audit ?? []).map(
		(entry) => ({
			...entry,
			outcome: entry.outcome === "success" ? "success" : "failure",
		}),
	);
	const downloads = activityQuery.data?.downloads ?? [];

	return (
		<section
			className="flex flex-col gap-6"
			aria-labelledby="instance-activity-title"
		>
			<div className="flex flex-col gap-1">
				<h2
					id="instance-activity-title"
					className="font-semibold text-foreground text-xl"
				>
					{m["settings.activity.title"]()}
				</h2>
				<p className="max-w-3xl text-muted-foreground text-sm leading-relaxed">
					{m["settings.activity.desc"]()}
				</p>
			</div>

			<section
				className="flex flex-col gap-4"
				aria-labelledby="active-devices-title"
			>
				<div className="flex flex-col gap-1">
					<h3
						id="active-devices-title"
						className="flex items-center gap-2 font-semibold text-foreground text-lg"
					>
						<MonitorPlay aria-hidden="true" className="size-5 text-primary" />
						{m["settings.activity.active_title"]()}
					</h3>
					<p className="text-muted-foreground text-sm leading-relaxed">
						{m["settings.activity.active_desc"]()}
					</p>
				</div>
				<div className="overflow-hidden rounded-lg ring-1 ring-foreground/10">
					{active.length === 0 ? (
						<p className="px-5 py-10 text-center text-muted-foreground text-sm">
							{m["settings.activity.none_active"]()}
						</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{m["settings.activity.user"]()}</TableHead>
									<TableHead>{m["settings.activity.activity"]()}</TableHead>
									<TableHead>{m["settings.activity.device"]()}</TableHead>
									<TableHead>{m["settings.activity.server"]()}</TableHead>
									<TableHead>{m["settings.activity.progress"]()}</TableHead>
									<TableHead>{m["settings.activity.updated"]()}</TableHead>
									<TableHead>
										<span className="sr-only">
											{m["settings.activity.action"]()}
										</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{active.map((playback) => {
									const PlaybackIcon =
										playback.kind === "reading" ? BookOpen : Headphones;
									return (
										<TableRow key={playback.sessionId}>
											<TableCell>
												<div className="flex min-w-40 items-center gap-2">
													<UserAvatar
														name={playback.userName}
														image={playback.userImage}
														className="size-7 text-[10px]"
													/>
													<span className="truncate font-medium">
														{playback.userName}
													</span>
												</div>
											</TableCell>
											<TableCell>
												<div className="flex min-w-48 items-center gap-2">
													<PlaybackIcon
														aria-hidden="true"
														className="size-4 shrink-0 text-muted-foreground"
													/>
													<div className="min-w-0">
														<p className="truncate font-medium">
															{playback.bookTitle}
														</p>
														<p className="text-muted-foreground text-xs">
															{playback.kind === "reading"
																? m["settings.activity.reading"]()
																: m["settings.activity.listening"]()}
														</p>
													</div>
												</div>
											</TableCell>
											<TableCell className="max-w-44 truncate text-muted-foreground">
												{playback.device ?? "—"}
											</TableCell>
											<TableCell className="max-w-36 truncate text-muted-foreground">
												{playback.serverId}
											</TableCell>
											<TableCell className="tabular-nums">
												{progressLabel(playback.progress)}
											</TableCell>
											<TableCell className="text-muted-foreground text-xs tabular-nums">
												<time dateTime={playback.updatedAt}>
													{formatDetailedDate(playback.updatedAt)}
												</time>
											</TableCell>
											<TableCell className="text-right">
												<Button
													type="button"
													variant="ghost"
													size="sm"
													className="text-destructive hover:text-destructive"
													disabled={revokeMutation.isPending}
													onClick={() =>
														revokeMutation.mutate(playback.sessionId)
													}
												>
													<SignOut
														data-icon="inline-start"
														aria-hidden="true"
													/>
													{m["settings.activity.revoke"]()}
												</Button>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</div>
			</section>

			<section
				className="flex flex-col gap-4"
				aria-labelledby="download-history-title"
			>
				<div className="flex flex-col gap-1">
					<h3
						id="download-history-title"
						className="flex items-center gap-2 font-semibold text-foreground text-lg"
					>
						<DownloadSimple
							aria-hidden="true"
							className="size-5 text-primary"
						/>
						{m["settings.activity.download_title"]()}
					</h3>
					<p className="text-muted-foreground text-sm leading-relaxed">
						{m["settings.activity.download_desc"]()}
					</p>
				</div>
				<DataTable
					features={dataTableFeatures}
					tableLabel={m["settings.activity.download_title"]()}
					columns={downloadColumns}
					data={downloads}
					getRowId={(entry) => String(entry.id)}
					isLoading={activityQuery.isLoading}
					pageSize={25}
					paginationLabels={{
						page: (page, pageCount) =>
							m["settings.activity.page"]({ page, pageCount }),
						previous: m["settings.activity.previous_page"](),
						next: m["settings.activity.next_page"](),
					}}
					emptyState={{
						description: m["settings.activity.empty_downloads"](),
					}}
				/>
			</section>

			<section
				className="flex flex-col gap-4"
				aria-labelledby="recent-access-title"
			>
				<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex flex-col gap-1">
						<h3
							id="recent-access-title"
							className="font-semibold text-foreground text-lg"
						>
							{m["settings.activity.audit_title"]()}
						</h3>
						<p className="text-muted-foreground text-sm leading-relaxed">
							{m["settings.activity.audit_desc"]()}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-2 sm:shrink-0">
						<ActivityFilterPopover
							outcome={outcome}
							setOutcome={setOutcome}
							userId={userId}
							setUserId={setUserId}
							device={device}
							setDevice={setDevice}
							serverId={serverId}
							setServerId={setServerId}
							clearFilters={clearFilters}
						/>
						<Button
							type="button"
							variant="outline"
							onClick={() => activityQuery.refetch()}
							disabled={activityQuery.isFetching}
						>
							<ArrowsClockwise
								data-icon="inline-start"
								aria-hidden="true"
								className={cn(activityQuery.isFetching && "animate-spin")}
							/>
							{m["settings.activity.refresh"]()}
						</Button>
					</div>
				</div>
				<div>
					<DataTable
						features={dataTableFeatures}
						tableLabel={m["settings.activity.audit_title"]()}
						columns={auditColumns}
						data={audit}
						getRowId={(entry) => String(entry.id)}
						isLoading={activityQuery.isLoading}
						pageSize={25}
						paginationLabels={{
							page: (page, pageCount) =>
								m["settings.activity.page"]({ page, pageCount }),
							previous: m["settings.activity.previous_page"](),
							next: m["settings.activity.next_page"](),
						}}
						emptyState={{
							description: m["settings.activity.empty_audit"](),
						}}
					/>
				</div>
			</section>
		</section>
	);
}

type FilterKey = "outcome" | "user" | "device" | "server";

function ActivityFilterPopover({
	outcome,
	setOutcome,
	userId,
	setUserId,
	device,
	setDevice,
	serverId,
	setServerId,
	clearFilters,
}: {
	outcome: OutcomeFilter;
	setOutcome: (value: OutcomeFilter) => void;
	userId: string;
	setUserId: (value: string) => void;
	device: string;
	setDevice: (value: string) => void;
	serverId: string;
	setServerId: (value: string) => void;
	clearFilters: () => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<FilterKey | null>(null);
	const activeCount =
		Number(outcome !== "all") +
		Number(Boolean(userId)) +
		Number(Boolean(device)) +
		Number(Boolean(serverId));
	const filters: Array<{
		key: FilterKey;
		label: string;
		Icon: typeof CheckCircle;
		active: boolean;
	}> = [
		{
			key: "outcome",
			label: m["settings.activity.result"](),
			Icon: CheckCircle,
			active: outcome !== "all",
		},
		{
			key: "user",
			label: m["settings.activity.filter_user"](),
			Icon: User,
			active: Boolean(userId),
		},
		{
			key: "device",
			label: m["settings.activity.filter_device"](),
			Icon: Desktop,
			active: Boolean(device),
		},
		{
			key: "server",
			label: m["settings.activity.filter_server"](),
			Icon: Buildings,
			active: Boolean(serverId),
		},
	];
	const visibleFilters = filters.filter((filter) =>
		filter.label
			.toLocaleLowerCase()
			.includes(search.trim().toLocaleLowerCase()),
	);
	const close = () => {
		setOpen(false);
		setSelected(null);
		setSearch("");
	};

	return (
		<Popover
			open={open}
			onOpenChange={(nextOpen) => {
				setOpen(nextOpen);
				if (!nextOpen) {
					setSelected(null);
					setSearch("");
				}
			}}
		>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant="outline"
					aria-label={m["settings.activity.filters"]()}
				>
					<Funnel data-icon="inline-start" aria-hidden="true" />
					{m["settings.activity.filters"]()}
					{activeCount > 0 && (
						<Badge className="ms-1 min-w-5 justify-center px-1 tabular-nums">
							{activeCount}
						</Badge>
					)}
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-80 max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0"
			>
				<div className="flex items-center justify-between border-b px-4 py-3">
					<p className="font-medium">
						{selected
							? filters.find((filter) => filter.key === selected)?.label
							: m["settings.activity.filters"]()}
					</p>
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={m["settings.close"]()}
						onClick={close}
					>
						<X aria-hidden="true" />
					</Button>
				</div>
				{selected ? (
					<div className="space-y-4 p-4">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="-ms-2"
							onClick={() => setSelected(null)}
						>
							<CaretLeft data-icon="inline-start" aria-hidden="true" />
							{m["settings.activity.filter_back"]()}
						</Button>
						<FilterEditor
							selected={selected}
							outcome={outcome}
							setOutcome={setOutcome}
							userId={userId}
							setUserId={setUserId}
							device={device}
							setDevice={setDevice}
							serverId={serverId}
							setServerId={setServerId}
						/>
					</div>
				) : (
					<>
						<div className="relative border-b p-3">
							<MagnifyingGlass
								aria-hidden="true"
								className="pointer-events-none absolute start-6 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
							/>
							<Input
								type="search"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder={m["settings.activity.filter_search"]()}
								autoComplete="off"
								className="w-full ps-9"
							/>
						</div>
						<div className="p-2">
							{visibleFilters.map(({ key, label, Icon, active }) => (
								<Button
									key={key}
									type="button"
									variant="ghost"
									className="w-full justify-start px-2.5"
									onClick={() => setSelected(key)}
								>
									<Icon
										data-icon="inline-start"
										aria-hidden="true"
										className="text-muted-foreground"
									/>
									<span className="flex-1 text-left">{label}</span>
									{active && (
										<Badge
											variant="secondary"
											className="min-w-5 justify-center px-1"
										>
											1
										</Badge>
									)}
									<CaretRight
										aria-hidden="true"
										className="size-4 text-muted-foreground"
									/>
								</Button>
							))}
						</div>
						{activeCount > 0 && (
							<div className="border-t p-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="w-full justify-start text-muted-foreground"
									onClick={clearFilters}
								>
									{m["settings.activity.clear_filters"]()}
								</Button>
							</div>
						)}
					</>
				)}
			</PopoverContent>
		</Popover>
	);
}

function FilterEditor({
	selected,
	outcome,
	setOutcome,
	userId,
	setUserId,
	device,
	setDevice,
	serverId,
	setServerId,
}: {
	selected: FilterKey;
	outcome: OutcomeFilter;
	setOutcome: (value: OutcomeFilter) => void;
	userId: string;
	setUserId: (value: string) => void;
	device: string;
	setDevice: (value: string) => void;
	serverId: string;
	setServerId: (value: string) => void;
}) {
	if (selected === "outcome")
		return (
			<div className="flex flex-col gap-1.5">
				<Label id="activity-result-label">
					{m["settings.activity.result"]()}
				</Label>
				<Select<OutcomeFilter> value={outcome} onValueChange={setOutcome}>
					<SelectTrigger
						aria-labelledby="activity-result-label"
						className="w-full"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">
							{m["settings.activity.all_results"]()}
						</SelectItem>
						<SelectItem value="success">
							{m["settings.activity.success"]()}
						</SelectItem>
						<SelectItem value="failure">
							{m["settings.activity.failure"]()}
						</SelectItem>
					</SelectContent>
				</Select>
			</div>
		);
	const values = {
		user: {
			id: "activity-user",
			label: m["settings.activity.filter_user"](),
			value: userId,
			setValue: setUserId,
		},
		device: {
			id: "activity-device",
			label: m["settings.activity.filter_device"](),
			value: device,
			setValue: setDevice,
		},
		server: {
			id: "activity-server",
			label: m["settings.activity.filter_server"](),
			value: serverId,
			setValue: setServerId,
		},
	};
	const field = values[selected];
	return (
		<div className="flex flex-col gap-1.5">
			<Label htmlFor={field.id}>{field.label}</Label>
			<Input
				id={field.id}
				value={field.value}
				onChange={(event) => field.setValue(event.target.value)}
				autoComplete="off"
			/>
		</div>
	);
}
