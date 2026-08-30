import {
	ArrowsCounterClockwise,
	DotsThree,
	EnvelopeOpen,
	GearSix,
	SignOut,
	User,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { useSettingsModal } from "@/components/layout/settings-modal-context";
import { preloadSettingsModal } from "@/components/layout/settings-modal-host";
import {
	MANUAL_PRESENCE_STATUSES,
	type ManualPresenceStatus,
	STATUS_META,
	StatusDot,
} from "@/components/shared/presence-status";
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
import { usePresenceStatus } from "@/hooks/use-presence-status";
import { useSession } from "@/hooks/use-session";
import { useSignOut } from "@/hooks/use-sign-out";
import { stopImpersonating } from "@/lib/impersonation";
import { m } from "@/paraglide/messages";

export function StatusSelector() {
	const { status, setStatus } = usePresenceStatus();

	return (
		<DropdownMenuSub>
			<DropdownMenuSubTrigger>
				<StatusDot status={status} />
				{STATUS_META[status].label()}
			</DropdownMenuSubTrigger>
			<DropdownMenuSubContent>
				<DropdownMenuRadioGroup
					value={status}
					onValueChange={(next) => setStatus(next as ManualPresenceStatus)}
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

/**
 * The account actions themselves, so the desktop navbar avatar and the mobile
 * profile-page menu can't drift. `onGoToProfile` is omitted by callers that are
 * already on the profile — there'd be nowhere for the entry to go.
 */
export function AccountMenuItems({
	onGoToProfile,
}: {
	onGoToProfile?: () => void;
}) {
	const { data: session } = useSession();
	const { openSettings } = useSettingsModal();
	const signOut = useSignOut();
	const stopImpersonatingMutation = useMutation({
		mutationFn: stopImpersonating,
		onError: () => toast.error(m["settings.users.stop_impersonating_failed"]()),
	});

	return (
		<>
			<DropdownMenuGroup>
				{onGoToProfile && (
					<DropdownMenuItem onClick={onGoToProfile}>
						<User />
						{m["nav.profile"]()}
					</DropdownMenuItem>
				)}
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
				{session?.session.impersonatedBy && (
					<DropdownMenuItem
						disabled={stopImpersonatingMutation.isPending}
						onClick={() => stopImpersonatingMutation.mutate()}
					>
						<ArrowsCounterClockwise />
						{m["settings.users.stop_impersonating"]()}
					</DropdownMenuItem>
				)}
				<DropdownMenuItem variant="destructive" onClick={signOut}>
					<SignOut />
					{m["nav.sign_out"]()}
				</DropdownMenuItem>
			</DropdownMenuGroup>
		</>
	);
}

/**
 * The own-profile page's account menu. On mobile the profile IS the account tab
 * — there's no navbar avatar down there — so this is the only way to reach
 * status, invitations, settings and sign out.
 */
export function AccountMenu() {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="secondary"
					size="icon-sm"
					aria-label={m["nav.menu"]()}
					title={m["nav.menu"]()}
					className="size-8 shadow-sm"
				>
					<DotsThree weight="bold" className="size-5" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" sideOffset={8} className="min-w-56">
				<AccountMenuItems />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
