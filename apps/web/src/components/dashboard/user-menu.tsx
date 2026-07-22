import {
	MANUAL_PRESENCE_STATUSES,
	type ManualPresenceStatus,
} from "@nanahoshi-v2/api/modules/presence/presence.types";
import { EnvelopeOpen, GearSix, User } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { preloadSettingsModal } from "@/components/layout/settings-modal-host";
import { PRESENCE_DOT } from "@/components/shared/presence-dot";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { useSession } from "@/hooks/use-session";
import { authClient } from "@/lib/auth-client";
import { clearOfflineCaches } from "@/lib/offline";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { client, orpc, queryClient } from "@/utils/orpc";

// Discord-style manual status. Invisible appears offline to others, so it reuses
// the offline dot color.
const STATUS_META: Record<
	ManualPresenceStatus,
	{ label: () => string; dot: string }
> = {
	online: { label: m["status.online"], dot: PRESENCE_DOT.online },
	away: { label: m["status.away"], dot: PRESENCE_DOT.away },
	invisible: { label: m["status.invisible"], dot: PRESENCE_DOT.offline },
};

function StatusDot({ status }: { status: ManualPresenceStatus }) {
	return (
		<span
			className={cn("size-2.5 shrink-0 rounded-full", STATUS_META[status].dot)}
		/>
	);
}

function StatusSelector() {
	const profileOptions = orpc.profile.getProfile.queryOptions();
	const { data: profile } = useQuery(profileOptions);
	const status = profile?.presenceStatus ?? "online";
	// Exact query key (not the partial .key() matcher) so setQueryData hits the
	// same cache entry the useQuery above — and the navbar avatar — read from.
	const key = profileOptions.queryKey;

	const mutation = useMutation({
		mutationFn: (next: ManualPresenceStatus) =>
			client.presence.setStatus({ status: next }),
		// Optimistic: flip the cached status (and the navbar dot) on click, before
		// the server round-trip — presenceStatus is exactly the value we send. Roll
		// back to the snapshot if the request fails.
		onMutate: async (next) => {
			await queryClient.cancelQueries({ queryKey: key });
			const previous = queryClient.getQueryData(key);
			queryClient.setQueryData(key, (old) =>
				old ? { ...old, presenceStatus: next } : old,
			);
			return { previous };
		},
		onError: (_err, _next, context) => {
			queryClient.setQueryData(key, context?.previous);
			toast.error(m["toast.status_update_failed"]());
		},
	});

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<StatusDot status={status} />
				{STATUS_META[status].label()}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				<DropdownMenuRadioGroup
					value={status}
					onValueChange={(next) =>
						mutation.mutate(next as ManualPresenceStatus)
					}
				>
					{MANUAL_PRESENCE_STATUSES.map((s) => (
						<DropdownMenuRadioItem key={s} value={s}>
							<StatusDot status={s} />
							{STATUS_META[s].label()}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuSubContent>
		</DropdownMenuSub>
	);
}

export function UserMenu({ collapsed = false }: { collapsed?: boolean }) {
	const navigate = useNavigate();
	const router = useRouter();
	const online = useOnlineStatus();
	const { data: session, isPending } = useSession();
	const { openSettings } = useSettingsModal();
	// Resolved (per-active-org) avatar; falls back to the global account image.
	const { data: profile } = useQuery({
		...orpc.profile.getProfile.queryOptions(),
		enabled: !!session,
	});
	const avatarImage =
		(profile?.image as string | null | undefined) ?? session?.user.image;
	const status = profile?.presenceStatus ?? "online";

	if (isPending) {
		return (
			<Skeleton
				className={collapsed ? "size-9 rounded-full" : "h-9 w-24 rounded-full"}
			/>
		);
	}

	if (!session) {
		return (
			<Link to="/login">
				<Button variant="outline">
					{collapsed ? "..." : m["auth.sign_in"]()}
				</Button>
			</Link>
		);
	}

	const handleGoToProfile = () => {
		const username = (session.user as { username?: string }).username;
		if (username) {
			navigate({
				to: "/dashboard/user/$username",
				params: { username },
			});
		} else {
			navigate({ to: "/dashboard/profile" });
		}
	};

	const handleSignOut = () => {
		authClient.signOut({
			fetchOptions: {
				onSuccess: async () => {
					queryClient.removeQueries({ queryKey: ["auth", "session"] });
					queryClient.clear();
					await clearOfflineCaches();
					await router.invalidate();
					navigate({ to: "/login" });
				},
			},
		});
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant={collapsed ? "ghost" : "outline"}
					className={
						collapsed
							? "size-9 rounded-full p-0 hover:bg-transparent"
							: "h-9 rounded-full pr-3 pl-1"
					}
				>
					<span className="relative shrink-0">
						<UserAvatar
							name={session.user.name}
							image={avatarImage}
							className={collapsed ? "size-8" : "size-7"}
							fallbackClassName="text-[11px]"
						/>
						<span
							className={cn(
								"absolute right-0 bottom-0 size-2.5 rounded-full ring-2",
								collapsed ? "ring-sidebar" : "ring-background",
								STATUS_META[status].dot,
							)}
						/>
					</span>
					{!collapsed && <span className="truncate">{session.user.name}</span>}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				sideOffset={8}
				className="min-w-56 bg-card"
			>
				<DropdownMenuGroup>
					<DropdownMenuItem onClick={handleGoToProfile} disabled={!online}>
						<User />
						{m["nav.profile"]()}
					</DropdownMenuItem>
					<DropdownMenuItem
						onPointerEnter={preloadSettingsModal}
						onClick={() => openSettings("profile")}
					>
						<GearSix />
						{m["nav.settings"]()}
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<StatusSelector />
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem asChild>
						<Link to="/dashboard/invitations">
							<EnvelopeOpen />
							{m["nav.invitations"]()}
						</Link>
					</DropdownMenuItem>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />
				<DropdownMenuGroup>
					<DropdownMenuItem variant="destructive" onClick={handleSignOut}>
						{m["nav.sign_out"]()}
					</DropdownMenuItem>
				</DropdownMenuGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
