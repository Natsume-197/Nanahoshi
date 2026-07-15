import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PRESENCE_DOT } from "@/components/shared/presence-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Skeleton } from "@/components/ui/skeleton";
import type { PresenceState } from "@/hooks/use-presence-events";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

type Friend = {
	id: string;
	name: string;
	username: string;
	displayUsername: string | null;
	image: string | null;
	state: PresenceState;
	book: { uuid: string; title: string } | null;
};

type BookRoute = "/dashboard/books/$uuid" | "/dashboard/audiobooks/$uuid";

// One source of truth per state: presence dot color, status verb, and (for the
// activity states) the route its book links to. Adding a state is a single edit.
const PRESENCE_META: Record<
	PresenceState,
	{ dot: string; verb: () => string; route: BookRoute | null }
> = {
	reading: {
		dot: PRESENCE_DOT.reading,
		verb: () => m["friends.reading"](),
		route: "/dashboard/books/$uuid",
	},
	listening: {
		dot: PRESENCE_DOT.listening,
		verb: () => m["friends.listening"](),
		route: "/dashboard/audiobooks/$uuid",
	},
	away: {
		dot: PRESENCE_DOT.away,
		verb: () => m["friends.away"](),
		route: null,
	},
	online: {
		dot: PRESENCE_DOT.online,
		verb: () => m["friends.online"](),
		route: null,
	},
	offline: {
		dot: PRESENCE_DOT.offline,
		verb: () => m["friends.offline"](),
		route: null,
	},
};

export function FriendsList() {
	// Fully push-driven: every presence transition arrives live over the gateway
	// WebSocket (usePresenceEvents patches this cache). No polling — the snapshot
	// only refetches on mount, window focus, and gateway (re)connect.
	const friendsQuery = useQuery(
		orpc.follow.getFriendsWithPresence.queryOptions({ input: { limit: 50 } }),
	);

	const friends = friendsQuery.data;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="flex shrink-0 items-center px-4 py-2">
				<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
					{m["friends.title"]()}
				</span>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
				{friendsQuery.isLoading ? (
					<FriendsSkeleton />
				) : !friends || friends.length === 0 ? (
					<p className="px-2 py-8 text-center text-muted-foreground text-sm">
						{m["friends.empty"]()}
					</p>
				) : (
					<div className="flex flex-col gap-0.5">
						{friends.map((friend) => (
							<FriendRow key={friend.id} friend={friend} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function statusLabel(friend: Friend): string {
	const { verb, route } = PRESENCE_META[friend.state];
	return route && friend.book?.title
		? `${verb()} ${friend.book.title}`
		: verb();
}

function FriendRow({ friend }: { friend: Friend }) {
	const meta = PRESENCE_META[friend.state];
	const isOffline = friend.state === "offline";
	const bookHref = meta.route && friend.book ? meta.route : null;

	return (
		<div
			className={cn(
				"flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/50",
				isOffline && "opacity-60",
			)}
		>
			<Link
				to="/dashboard/user/$username"
				params={{ username: friend.username }}
				className="relative shrink-0"
				aria-label={m["friends.profile_of"]({ name: friend.name })}
			>
				<UserAvatar
					name={friend.name}
					image={friend.image}
					className="size-9"
					fallbackClassName="text-xs"
				/>
				<span
					className={cn(
						"absolute right-0 bottom-0 size-2.5 rounded-full ring-2 ring-background",
						meta.dot,
					)}
				/>
			</Link>
			<div className="flex min-w-0 flex-1 flex-col">
				<Link
					to="/dashboard/user/$username"
					params={{ username: friend.username }}
					className="truncate font-medium text-foreground text-sm leading-tight hover:underline"
					title={friend.name}
				>
					{friend.name}
				</Link>
				{bookHref && friend.book ? (
					<Link
						to={bookHref}
						params={{ uuid: friend.book.uuid }}
						className="truncate text-muted-foreground text-xs leading-tight hover:underline"
						title={statusLabel(friend)}
					>
						{statusLabel(friend)}
					</Link>
				) : (
					<span className="truncate text-muted-foreground text-xs leading-tight">
						{statusLabel(friend)}
					</span>
				)}
			</div>
		</div>
	);
}

function FriendsSkeleton() {
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
