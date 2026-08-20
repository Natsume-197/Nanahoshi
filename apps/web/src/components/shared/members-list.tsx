import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { PRESENCE_DOT } from "@/components/shared/presence-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { PresenceState } from "@/hooks/use-presence-events";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

type Member = {
	id: string;
	name: string;
	username: string;
	displayUsername: string | null;
	image: string | null;
	state: PresenceState;
	book: { uuid: string; title: string } | null;
};

type ActivityState = "reading" | "listening";

// Only the activity states carry a second line (verb + linked book); the other
// states are conveyed by the presence dot and the Online/Offline group headers.
const ACTIVITY_META: Record<
	ActivityState,
	{
		verb: () => string;
		route: "/dashboard/books/$uuid" | "/dashboard/audiobooks/$uuid";
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
};

function activityMeta(state: PresenceState) {
	return state === "reading" || state === "listening"
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

	return (
		<div
			className={cn(
				"flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50",
				isOffline && "opacity-60",
			)}
		>
			<Link
				to="/dashboard/user/$username"
				params={{ username: member.username }}
				onClick={onNavigate}
				className="relative shrink-0"
				aria-label={m["members.profile_of"]({ name: member.name })}
			>
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
			</Link>
			<div className="flex min-w-0 flex-1 flex-col">
				<Link
					to="/dashboard/user/$username"
					params={{ username: member.username }}
					onClick={onNavigate}
					className="truncate font-medium text-foreground text-sm leading-tight hover:underline"
					title={member.name}
				>
					{member.name}
				</Link>
				{meta && member.book && statusLabel ? (
					<Link
						to={meta.route}
						params={{ uuid: member.book.uuid }}
						onClick={onNavigate}
						className="truncate text-muted-foreground text-xs leading-tight hover:underline"
						title={statusLabel}
					>
						{statusLabel}
					</Link>
				) : null}
			</div>
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
