import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import {
	LinkSimple as LinkIcon,
	CircleNotch,
	SignOut,
	Monitor,
	DeviceMobile,
	Trash,
	LinkBreak,
	X,
} from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { clearOfflineCaches } from "@/lib/offline";
import { m } from "@/paraglide/messages";
import { formatDetailedDate } from "@/utils/format";
import { queryClient } from "@/utils/orpc";

function parseUserAgent(ua: string | null | undefined) {
	if (!ua)
		return {
			device: m["settings.account.unknown"](),
			browser: m["settings.account.unknown"](),
		};

	const isMobile = /mobile|android|iphone|ipad/i.test(ua);

	let browser: string = m["settings.account.unknown"]();
	if (ua.includes("Firefox")) browser = "Firefox";
	else if (ua.includes("Edg")) browser = "Edge";
	else if (ua.includes("Chrome")) browser = "Chrome";
	else if (ua.includes("Safari")) browser = "Safari";

	let os = "";
	if (ua.includes("Windows")) os = "Windows";
	else if (ua.includes("Mac")) os = "macOS";
	else if (ua.includes("Linux")) os = "Linux";
	else if (ua.includes("Android")) os = "Android";
	else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

	const device = os
		? m["settings.account.device_on"]({ browser, os })
		: browser;
	return { device, isMobile };
}

export function AccountSettings() {
	const navigate = useNavigate();
	const router = useRouter();
	const sessionQuery = useQuery({
		queryKey: ["auth", "current-session"],
		queryFn: async () => {
			const res = await authClient.getSession();
			return res.data;
		},
	});

	const sessionsQuery = useQuery({
		queryKey: ["auth", "sessions"],
		queryFn: async () => {
			const res = await authClient.listSessions();
			return res.data ?? [];
		},
	});

	const accountsQuery = useQuery({
		queryKey: ["auth", "accounts"],
		queryFn: async () => {
			const res = await authClient.listAccounts();
			return res.data ?? [];
		},
	});

	const isDiscordLinked = accountsQuery.data?.some(
		(a) => a.providerId === "discord",
	);

	const linkDiscordMutation = useMutation({
		mutationFn: async () => {
			const res = await authClient.linkSocial({
				provider: "discord",
				callbackURL: `${window.location.origin}/dashboard`,
				disableRedirect: true,
			});
			const url = (res as { data?: { url?: string } })?.data?.url;
			if (url) {
				window.location.href = url;
			}
		},
		onError: () => toast.error(m["toast.discord_link_failed"]()),
	});

	const unlinkDiscordMutation = useMutation({
		mutationFn: async () => {
			await authClient.unlinkAccount({ providerId: "discord" });
		},
		onSuccess: () => {
			accountsQuery.refetch();
			toast.success(m["toast.discord_disconnected"]());
		},
		onError: () => toast.error(m["toast.discord_unlink_failed"]()),
	});

	const currentToken = sessionQuery.data?.session?.token;

	const revokeMutation = useMutation({
		mutationFn: async (token: string) => {
			await authClient.revokeSession({ token });
		},
		onSuccess: () => {
			sessionsQuery.refetch();
			toast.success(m["toast.session_revoked"]());
		},
		onError: () => toast.error(m["toast.session_revoke_failed"]()),
	});

	const signOutMutation = useMutation({
		mutationFn: async () => {
			await authClient.signOut();
		},
		onSuccess: async () => {
			queryClient.removeQueries({ queryKey: ["auth", "session"] });
			queryClient.clear();
			await clearOfflineCaches();
			await router.invalidate();
			navigate({ to: "/login" });
		},
		onError: () => toast.error(m["toast.sign_out_failed"]()),
	});

	const [deleteConfirm, setDeleteConfirm] = useState("");
	const [deleteOpen, setDeleteOpen] = useState(false);

	const deleteAccountMutation = useMutation({
		mutationFn: async () => {
			await authClient.deleteUser();
		},
		onSuccess: async () => {
			queryClient.removeQueries({ queryKey: ["auth", "session"] });
			queryClient.clear();
			await router.invalidate();
			navigate({ to: "/login" });
		},
		onError: () => toast.error(m["toast.delete_account_failed"]()),
	});
	const deleteAccountConfirmPhrase = m["settings.account.confirm_phrase"]();

	return (
		<div className="space-y-8">
			<section>
				<h2 className="mb-1 font-semibold text-lg">
					{m["settings.account.connected_accounts"]()}
				</h2>
				<p className="mb-5 text-muted-foreground text-sm">
					{m["settings.account.connected_accounts_desc"]()}
				</p>

				<div className="space-y-3">
					{accountsQuery.isLoading ? (
						<Skeleton className="h-16 w-full rounded-lg" />
					) : (
						<div className="flex items-center gap-4 rounded-lg border p-4">
							<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-[#5865F2]/10">
								<DiscordIcon className="size-4 text-[#5865F2]" />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2">
									<p className="font-medium text-sm">Discord</p>
									{isDiscordLinked && (
										<span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
											{m["settings.account.connected"]()}
										</span>
									)}
								</div>
								<p className="text-muted-foreground text-xs">
									{isDiscordLinked
										? m["settings.account.discord_linked"]()
										: m["settings.account.discord_connect"]()}
								</p>
							</div>
							{isDiscordLinked ? (
								<Button
									variant="ghost"
									size="sm"
									className="shrink-0 text-muted-foreground hover:text-destructive"
									onClick={() => unlinkDiscordMutation.mutate()}
									disabled={unlinkDiscordMutation.isPending}
								>
									{unlinkDiscordMutation.isPending ? (
										<CircleNotch className="mr-2 size-4 animate-spin" />
									) : (
										<LinkBreak className="mr-2 size-4" />
									)}
									{m["settings.account.disconnect"]()}
								</Button>
							) : (
								<Button
									variant="outline"
									size="sm"
									className="shrink-0"
									onClick={() => linkDiscordMutation.mutate()}
									disabled={linkDiscordMutation.isPending}
								>
									{linkDiscordMutation.isPending ? (
										<CircleNotch className="mr-2 size-4 animate-spin" />
									) : (
										<LinkIcon className="mr-2 size-4" />
									)}
									{m["settings.account.connect"]()}
								</Button>
							)}
						</div>
					)}
				</div>
			</section>

			<Separator />

			<section>
				<h2 className="mb-1 font-semibold text-lg">
					{m["settings.account.active_sessions"]()}
				</h2>
				<p className="mb-5 text-muted-foreground text-sm">
					{m["settings.account.active_sessions_desc"]()}
				</p>

				<div className="space-y-3">
					{sessionsQuery.isLoading ? (
						<>
							<Skeleton className="h-16 w-full rounded-lg" />
							<Skeleton className="h-16 w-full rounded-lg" />
						</>
					) : sessionsQuery.data?.length === 0 ? (
						<p className="text-muted-foreground text-sm">
							{m["settings.account.no_active_sessions"]()}
						</p>
					) : (
						sessionsQuery.data?.map((session) => {
							const isCurrent = session.token === currentToken;
							const { device, isMobile } = parseUserAgent(session.userAgent);
							const DeviceIcon = isMobile ? DeviceMobile : Monitor;

							return (
								<div
									key={session.token}
									className="flex items-center gap-4 rounded-lg border p-4"
								>
									<div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
										<DeviceIcon className="size-4 text-muted-foreground" />
									</div>
									<div className="min-w-0 flex-1">
										<div className="flex items-center gap-2">
											<p className="truncate font-medium text-sm">{device}</p>
											{isCurrent && (
												<span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
													{m["settings.account.current"]()}
												</span>
											)}
										</div>
										<p className="text-muted-foreground text-xs">
											{session.ipAddress ?? m["settings.account.unknown_ip"]()}{" "}
											&middot;{" "}
											{m["settings.account.signed_in"]({
												date: formatDetailedDate(session.createdAt),
											})}
										</p>
									</div>
									{!isCurrent && (
										<Button
											variant="ghost"
											size="icon"
											className="shrink-0 text-muted-foreground hover:text-destructive"
											aria-label={m["settings.account.revoke_session"]({
												device,
											})}
											onClick={() => revokeMutation.mutate(session.token)}
											disabled={revokeMutation.isPending}
										>
											<X className="size-4" />
										</Button>
									)}
								</div>
							);
						})
					)}
				</div>
			</section>

			<Separator />

			<section>
				<h2 className="mb-1 font-semibold text-lg">
					{m["settings.account.sign_out_title"]()}
				</h2>
				<p className="mb-4 text-muted-foreground text-sm">
					{m["settings.account.sign_out_desc"]()}
				</p>
				<Button
					variant="outline"
					onClick={() => signOutMutation.mutate()}
					disabled={signOutMutation.isPending}
				>
					{signOutMutation.isPending ? (
						<CircleNotch className="mr-2 size-4 animate-spin" />
					) : (
						<SignOut className="mr-2 size-4" />
					)}
					{m["settings.account.sign_out"]()}
				</Button>
			</section>

			<Separator />

			<section>
				<h2 className="mb-1 font-semibold text-destructive text-lg">
					{m["settings.account.danger_zone"]()}
				</h2>
				<p className="mb-4 text-muted-foreground text-sm">
					{m["settings.account.danger_desc"]()}
				</p>

				<Button variant="destructive" onClick={() => setDeleteOpen(true)}>
					<Trash className="mr-2 size-4" />
					{m["settings.account.delete_account"]()}
				</Button>

				<Modal
					open={deleteOpen}
					onOpenChange={(open) => {
						setDeleteOpen(open);
						if (!open) setDeleteConfirm("");
					}}
					title={m["settings.account.delete_title"]()}
					description={m["settings.account.delete_desc"]()}
					footer={
						<>
							<Button
								type="button"
								variant="outline"
								onClick={() => setDeleteOpen(false)}
							>
								{m["common.cancel"]()}
							</Button>
							<Button
								type="button"
								disabled={
									deleteConfirm !== deleteAccountConfirmPhrase ||
									deleteAccountMutation.isPending
								}
								onClick={() => deleteAccountMutation.mutate()}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								{deleteAccountMutation.isPending && (
									<CircleNotch className="mr-2 size-4 animate-spin" />
								)}
								{m["settings.account.delete_account"]()}
							</Button>
						</>
					}
				>
					<div className="space-y-2">
						<p className="font-medium text-sm">
							{m["settings.account.confirm_type"]({
								phrase: deleteAccountConfirmPhrase,
							})}
						</p>
						<Input
							value={deleteConfirm}
							onChange={(e) => setDeleteConfirm(e.target.value)}
							placeholder={deleteAccountConfirmPhrase}
						/>
					</div>
				</Modal>
			</section>
		</div>
	);
}
