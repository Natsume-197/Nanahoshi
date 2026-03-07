import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, LogOut, Monitor, Smartphone, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/dashboard/settings/account")({
	component: AccountSettings,
});

function formatDate(date: string | Date) {
	return new Date(date).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function parseUserAgent(ua: string | null | undefined) {
	if (!ua) return { device: "Unknown", browser: "Unknown" };

	const isMobile = /mobile|android|iphone|ipad/i.test(ua);

	let browser = "Unknown";
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

	const device = os ? `${browser} on ${os}` : browser;
	return { device, isMobile };
}

function AccountSettings() {
	const navigate = useNavigate();
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

	const currentToken = sessionQuery.data?.session?.token;

	const revokeMutation = useMutation({
		mutationFn: async (token: string) => {
			await authClient.revokeSession({ token });
		},
		onSuccess: () => {
			sessionsQuery.refetch();
			toast.success("Session revoked");
		},
		onError: () => toast.error("Failed to revoke session"),
	});

	const signOutMutation = useMutation({
		mutationFn: async () => {
			await authClient.signOut();
		},
		onSuccess: () => {
			navigate({ to: "/" });
		},
		onError: () => toast.error("Failed to sign out"),
	});

	const [deleteConfirm, setDeleteConfirm] = useState("");

	const deleteAccountMutation = useMutation({
		mutationFn: async () => {
			await authClient.deleteUser();
		},
		onSuccess: () => {
			navigate({ to: "/" });
		},
		onError: () => toast.error("Failed to delete account"),
	});

	return (
		<div className="space-y-8">
			{/* Active Sessions */}
			<section>
				<h2 className="mb-1 font-semibold text-lg">Active Sessions</h2>
				<p className="mb-5 text-muted-foreground text-sm">
					Devices where your account is currently signed in
				</p>

				<div className="space-y-3">
					{sessionsQuery.isLoading ? (
						<>
							<Skeleton className="h-16 w-full rounded-lg" />
							<Skeleton className="h-16 w-full rounded-lg" />
						</>
					) : sessionsQuery.data?.length === 0 ? (
						<p className="text-muted-foreground text-sm">No active sessions</p>
					) : (
						sessionsQuery.data?.map((session) => {
							const isCurrent = session.token === currentToken;
							const { device, isMobile } = parseUserAgent(
								session.userAgent,
							);
							const DeviceIcon = isMobile ? Smartphone : Monitor;

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
												<span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-500 text-xs">
													Current
												</span>
											)}
										</div>
										<p className="text-muted-foreground text-xs">
											{session.ipAddress ?? "Unknown IP"} &middot; Signed in{" "}
											{formatDate(session.createdAt)}
										</p>
									</div>
									{!isCurrent && (
										<Button
											variant="ghost"
											size="icon"
											className="shrink-0 text-muted-foreground hover:text-destructive"
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

			{/* Sign Out */}
			<section>
				<h2 className="mb-1 font-semibold text-lg">Sign Out</h2>
				<p className="mb-4 text-muted-foreground text-sm">
					Sign out of your current session on this device
				</p>
				<Button
					variant="outline"
					onClick={() => signOutMutation.mutate()}
					disabled={signOutMutation.isPending}
				>
					{signOutMutation.isPending ? (
						<Loader2 className="mr-2 size-4 animate-spin" />
					) : (
						<LogOut className="mr-2 size-4" />
					)}
					Sign out
				</Button>
			</section>

			<Separator />

			{/* Danger Zone */}
			<section>
				<h2 className="mb-1 font-semibold text-destructive text-lg">
					Danger Zone
				</h2>
				<p className="mb-4 text-muted-foreground text-sm">
					Permanently delete your account and all associated data. This action
					cannot be undone.
				</p>

				<AlertDialog>
					<AlertDialogTrigger asChild>
						<Button variant="destructive">
							<Trash2 className="mr-2 size-4" />
							Delete account
						</Button>
					</AlertDialogTrigger>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
							<AlertDialogDescription>
								This will permanently delete your account, reading progress,
								and all associated data. This action cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<div className="space-y-2 py-2">
							<p className="font-medium text-sm">
								Type{" "}
								<span className="font-mono text-destructive">delete my account</span>{" "}
								to confirm
							</p>
							<Input
								value={deleteConfirm}
								onChange={(e) => setDeleteConfirm(e.target.value)}
								placeholder="delete my account"
							/>
						</div>
						<AlertDialogFooter>
							<AlertDialogCancel onClick={() => setDeleteConfirm("")}>
								Cancel
							</AlertDialogCancel>
							<AlertDialogAction
								disabled={
									deleteConfirm !== "delete my account" ||
									deleteAccountMutation.isPending
								}
								onClick={(e) => {
									e.preventDefault();
									deleteAccountMutation.mutate();
								}}
								className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							>
								{deleteAccountMutation.isPending && (
									<Loader2 className="mr-2 size-4 animate-spin" />
								)}
								Delete account
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</section>
		</div>
	);
}
