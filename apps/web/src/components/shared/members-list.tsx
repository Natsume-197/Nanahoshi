import { BookOpen, DotsThree, Headphones } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import { ReadListenIcon } from "@/components/read-listen/read-listen-icon";
import { resolveLiveListeningPosition } from "@/components/shared/member-activity-progress";
import { PRESENCE_DOT } from "@/components/shared/presence-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { useInterval } from "@/hooks/use-interval";
import type { PresenceState } from "@/hooks/use-presence-events";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
} from "@/utils/covers";
import { formatTime } from "@/utils/format";
import { orpc } from "@/utils/orpc";
import { getHeaderPreviewUrl } from "@/utils/profile-images";

type Member = {
	id: string;
	name: string;
	username: string;
	displayUsername: string | null;
	image: string | null;
	headerImage: string | null;
	state: PresenceState;
	book: {
		uuid: string;
		title: string;
		cover?: string | null;
		progress?: {
			currentTimeSeconds: number;
			durationSeconds: number;
			updatedAt: number;
			playbackRate: number;
			receivedAt?: number;
		};
		pairUuid?: string;
		audiobook?: { uuid: string; title: string; cover: string | null };
	} | null;
};

type ActivityState = "reading" | "listening" | "read_listen";

// Only the activity states carry a second line (verb + linked book); the other
// states are conveyed by the presence dot and the Online/Offline group headers.
const ACTIVITY_META: Record<
	ActivityState,
	{
		verb: () => string;
		route?: "/dashboard/books/$uuid" | "/dashboard/audiobooks/$uuid";
	}
> = {
	reading: {
		verb: () => m["members.reading"](),
		route: "/dashboard/books/$uuid",
	},
	listening: {
		verb: () => m["members.listening"](),
		route: "/dashboard/audiobooks/$uuid",
	},
	read_listen: {
		verb: () => m["members.read_listen"](),
	},
};

function activityMeta(state: PresenceState) {
	return state === "reading" || state === "listening" || state === "read_listen"
		? ACTIVITY_META[state]
		: null;
}

type Row =
	| { type: "header"; key: string; label: string; first: boolean }
	| { type: "member"; key: string; member: Member };

function buildRows(members: Member[]): Row[] {
	const online = members.filter((member) => member.state !== "offline");
	const offline = members.filter((member) => member.state === "offline");
	const rows: Row[] = [];
	for (const [group, label] of [
		[online, m["members.online_group"]({ count: online.length })],
		[offline, m["members.offline_group"]({ count: offline.length })],
	] as const) {
		if (group.length === 0) continue;
		rows.push({
			type: "header",
			key: `header:${label}`,
			label,
			first: rows.length === 0,
		});
		for (const member of group) {
			rows.push({ type: "member", key: member.id, member });
		}
	}
	return rows;
}

export function MembersList({
	onNavigate,
	className,
}: {
	onNavigate?: () => void;
	className?: string;
} = {}) {
	// Gateway events patch the cache immediately. A low-frequency snapshot is a
	// recovery net for abrupt process/network loss, where no final event exists.
	const membersQuery = useQuery({
		...orpc.members.withPresence.queryOptions(),
		// Push events are primary. This bounded snapshot is the recovery path for
		// abrupt process/network loss where no final offline event can be emitted.
		refetchInterval: 60_000,
	});
	const scrollRef = useRef<HTMLDivElement>(null);

	const members = membersQuery.data;
	const rows = members ? buildRows(members) : [];
	// Rows are virtualized so a large roster costs a screenful of DOM nodes, not
	// one per member.
	const virtualizer = useVirtualizer({
		count: rows.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: (index) => (rows[index].type === "header" ? 32 : 48),
		overscan: 8,
		getItemKey: (index) => rows[index].key,
	});

	return (
		<div className="flex min-h-0 min-w-0 flex-1 flex-col">
			<div
				ref={scrollRef}
				className={cn("min-h-0 flex-1 overflow-y-auto px-2 pb-2", className)}
			>
				{membersQuery.isLoading ? (
					<MembersSkeleton />
				) : rows.length === 0 ? (
					<p className="max-w-full whitespace-normal break-words px-2 py-8 text-center text-muted-foreground text-sm">
						{m["members.empty"]()}
					</p>
				) : (
					<div
						className="relative w-full"
						style={{ height: virtualizer.getTotalSize() }}
					>
						{virtualizer.getVirtualItems().map((item) => {
							const row = rows[item.index];
							return (
								<div
									key={item.key}
									data-index={item.index}
									ref={virtualizer.measureElement}
									className="absolute inset-x-0 top-0"
									style={{ transform: `translateY(${item.start}px)` }}
								>
									{row.type === "header" ? (
										<h3
											className={cn(
												"px-2 pb-1 font-medium text-muted-foreground text-xs uppercase tracking-wide",
												row.first ? "pt-1" : "pt-4",
											)}
										>
											{row.label}
										</h3>
									) : (
										<MemberRow member={row.member} onNavigate={onNavigate} />
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

function MemberRow({
	member,
	onNavigate,
}: {
	member: Member;
	onNavigate?: () => void;
}) {
	const meta = activityMeta(member.state);
	const isOffline = member.state === "offline";
	const statusLabel =
		meta && member.book ? `${meta.verb()} ${member.book.title}` : null;
	const readListenActive =
		member.state === "read_listen" &&
		Boolean(member.book?.pairUuid) &&
		Boolean(member.book?.audiobook);

	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className={cn(
						"flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						isOffline && "opacity-60",
					)}
					aria-label={m["members.profile_of"]({ name: member.name })}
				>
					<span className="relative shrink-0">
						<UserAvatar
							name={member.name}
							image={member.image}
							className="size-9"
							fallbackClassName="text-xs"
						/>
						<span
							className={cn(
								"absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-background",
								PRESENCE_DOT[member.state],
							)}
						/>
					</span>
					<span className="flex min-w-0 flex-1 flex-col">
						<span className="truncate font-medium text-foreground text-sm leading-tight">
							{member.name}
						</span>
						{statusLabel ? (
							<span className="truncate text-muted-foreground text-xs leading-tight">
								{statusLabel}
							</span>
						) : null}
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[min(24rem,calc(100vw-2rem))] gap-0 overflow-hidden rounded-2xl p-0"
			>
				<div className="relative h-28 bg-muted">
					{member.headerImage ? (
						<img
							src={getHeaderPreviewUrl(member.headerImage)}
							alt=""
							className="h-full w-full object-cover"
							decoding="async"
						/>
					) : (
						<div className="h-full w-full bg-gradient-to-br from-primary/35 via-muted to-chart-5/35" />
					)}
					<div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-popover/35 to-transparent" />
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<button
								type="button"
								aria-label={m["nav.more"]()}
								className="absolute top-2.5 right-2.5 grid size-9 place-items-center rounded-full bg-black/35 text-white shadow-sm transition-colors hover:bg-black/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
							>
								<DotsThree
									aria-hidden="true"
									className="size-5"
									weight="bold"
								/>
							</button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end" className="min-w-36">
							<DropdownMenuItem asChild>
								<Link
									to="/dashboard/user/$username"
									params={{ username: member.username }}
									onClick={onNavigate}
								>
									{m["members.view_profile"]()}
								</Link>
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<div className="relative px-4 pt-0 pb-4">
					<div className="-mt-9 flex min-w-0 items-end gap-3">
						<div className="relative shrink-0 rounded-full bg-popover p-1">
							<UserAvatar
								name={member.name}
								image={member.image}
								className="size-[4.5rem]"
								fallbackClassName="text-xl"
							/>
							<span
								className={cn(
									"absolute right-1 bottom-1 size-4 rounded-full ring-2 ring-popover",
									PRESENCE_DOT[member.state],
								)}
							/>
						</div>
						<div className="min-w-0 pb-1.5">
							<PopoverTitle className="truncate font-semibold text-lg leading-tight">
								{member.name}
							</PopoverTitle>
							<p className="truncate text-muted-foreground text-sm leading-snug">
								@{member.displayUsername ?? member.username}
							</p>
						</div>
					</div>
					{meta && member.book && statusLabel ? (
						<div className="mt-4 rounded-xl border border-border bg-card p-3 shadow-sm">
							<p className="flex items-center gap-1.5 font-medium text-muted-foreground text-xs">
								{readListenActive ? (
									<ReadListenIcon aria-hidden="true" className="size-4" />
								) : null}
								{meta.verb()}
							</p>
							<div className="mt-3 flex gap-3">
								<ActivityArtwork
									book={member.book}
									readListen={readListenActive}
									mediaType={
										member.state === "listening" ? "audiobook" : "ebook"
									}
								/>
								<div className="min-w-0 flex-1 pt-0.5">
									{readListenActive ? (
										<Link
											to="/reader/$uuid"
											params={{ uuid: member.book.uuid }}
											search={{ pair: member.book.pairUuid ?? "" }}
											onClick={onNavigate}
											className="mt-1 line-clamp-2 block font-semibold text-sm leading-tight hover:underline"
											title={member.book.title}
										>
											{member.book.title}
										</Link>
									) : meta.route ? (
										<Link
											to={meta.route}
											params={{ uuid: member.book.uuid }}
											onClick={onNavigate}
											className="mt-1 line-clamp-2 block font-semibold text-sm leading-tight hover:underline"
											title={member.book.title}
										>
											{member.book.title}
										</Link>
									) : (
										<p
											className="mt-1 line-clamp-2 font-semibold text-sm leading-tight"
											title={member.book.title}
										>
											{member.book.title}
										</p>
									)}
									{member.state === "listening" && member.book.progress ? (
										<ListeningProgress progress={member.book.progress} />
									) : null}
								</div>
							</div>
						</div>
					) : null}
				</div>
			</PopoverContent>
		</Popover>
	);
}

function ListeningProgress({
	progress,
}: {
	progress: {
		currentTimeSeconds: number;
		durationSeconds: number;
		updatedAt: number;
		playbackRate: number;
		receivedAt?: number;
	};
}) {
	const [now, setNow] = useState(() => Date.now());
	// This component only exists while its profile card is open, so the clock
	// updates the one visible activity instead of the complete members roster.
	useInterval(() => setNow(Date.now()), 1_000);
	const position = resolveLiveListeningPosition({ ...progress, now });
	const duration = Math.max(1, progress.durationSeconds);
	const percent = Math.min(100, (position / duration) * 100);
	return (
		<div className="mt-2">
			<div className="flex items-center gap-2 text-muted-foreground text-xs tabular-nums">
				<span>{formatTime(position)}</span>
				<div
					className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
					role="progressbar"
					aria-valuemin={0}
					aria-valuemax={duration}
					aria-valuenow={Math.min(position, duration)}
					aria-label={m["members.listening"]()}
				>
					<div
						className="h-full rounded-full bg-primary"
						style={{ width: `${percent}%` }}
					/>
				</div>
				<span>{formatTime(duration)}</span>
			</div>
		</div>
	);
}

function ActivityArtwork({
	book,
	readListen,
	mediaType,
}: {
	book: NonNullable<Member["book"]>;
	readListen: boolean;
	mediaType: "ebook" | "audiobook";
}) {
	if (readListen && book.audiobook) {
		return (
			<div className="relative h-16 w-[4.6rem] shrink-0" aria-hidden="true">
				<ArtworkImage
					cover={book.cover}
					mediaType="ebook"
					className="absolute inset-y-0 left-0 w-11"
				/>
				<ArtworkImage
					cover={book.audiobook.cover}
					mediaType="audiobook"
					className="absolute right-0 bottom-0 size-11"
				/>
			</div>
		);
	}

	return (
		<ArtworkImage
			cover={book.cover}
			mediaType={mediaType}
			className="h-16 w-11 shrink-0"
		/>
	);
}

function ArtworkImage({
	cover,
	mediaType,
	className,
}: {
	cover?: string | null;
	mediaType: "ebook" | "audiobook";
	className: string;
}) {
	const filename = getCoverFilename(cover ?? null);
	return (
		<div
			className={cn(
				"overflow-hidden rounded-md bg-background shadow-sm outline outline-1 outline-black/10 dark:outline-white/10",
				className,
			)}
		>
			{filename ? (
				<img
					src={getCoverPresetUrl(filename, coverPresets.card)}
					alt=""
					className="size-full object-cover"
					loading="lazy"
					decoding="async"
				/>
			) : (
				<div className="grid size-full place-items-center text-muted-foreground">
					{mediaType === "audiobook" ? (
						<Headphones aria-hidden="true" className="size-5" />
					) : (
						<BookOpen aria-hidden="true" className="size-5" />
					)}
				</div>
			)}
		</div>
	);
}

function MembersSkeleton() {
	return (
		<div className="flex flex-col gap-3 px-2 pt-2">
			{[0, 1, 2, 3].map((i) => (
				<div key={i} className="flex items-center gap-2.5">
					<Skeleton className="size-9 rounded-full" />
					<div className="flex flex-1 flex-col gap-1.5">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-2.5 w-16" />
					</div>
				</div>
			))}
		</div>
	);
}
