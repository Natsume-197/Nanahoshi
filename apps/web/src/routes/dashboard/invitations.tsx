import { CircleNotch } from "@phosphor-icons/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	redirect,
	type SearchSchemaInput,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { authClient } from "@/lib/auth-client";
import { PAGE_SHELL } from "@/lib/page-layout";
import { optionalString } from "@/lib/search-validators";
import { switchActiveServer } from "@/lib/switch-server";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatDate, getErrorMessage } from "@/utils/format";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/invitations")({
	component: InvitationsPage,
	validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
		token: optionalString(search.token),
	}),
	beforeLoad: ({ context }) => {
		const session = context.session;
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	loader: ({ context }) => {
		if (typeof window === "undefined") return;
		context.queryClient.prefetchQuery(orpc.invitations.listMine.queryOptions());
	},
});

function InvitationsPage() {
	const router = useRouter();
	const qc = useQueryClient();
	const { token } = Route.useSearch();

	// Auto-accept state when arriving from email link
	const [tokenStatus, setTokenStatus] = useState<
		"idle" | "accepting" | "accepted" | "error"
	>(token ? "accepting" : "idle");
	const [tokenError, setTokenError] = useState("");

	// On mount, if there's a token in the URL, accept it automatically
	useMountEffect(() => {
		if (!token) return;
		let cancelled = false;
		let redirectTimer: ReturnType<typeof setTimeout> | undefined;
		(async () => {
			const { error } = await authClient.organization.acceptInvitation({
				invitationId: token,
			});
			if (cancelled) return;
			if (error) {
				setTokenStatus("error");
				setTokenError(error.message ?? m["member_invitations.invalid_desc"]());
				return;
			}
			setTokenStatus("accepted");
			toast.success(m["member_invitations.joined"]());
			qc.removeQueries({ queryKey: ["auth", "session"] });
			qc.clear();
			// Remove token from URL cleanly, then redirect to dashboard
			redirectTimer = setTimeout(async () => {
				if (cancelled) return;
				await router.invalidate();
				if (cancelled) return;
				router.navigate({ to: "/dashboard" });
			}, 1500);
		})();
		return () => {
			cancelled = true;
			if (redirectTimer) clearTimeout(redirectTimer);
		};
	});

	const invitationsQuery = orpc.invitations.listMine.queryOptions();
	const { data: invitations, isLoading } = useQuery({
		...invitationsQuery,
		// Only fetch the list if we're not mid-accept
		enabled: tokenStatus === "idle" || tokenStatus === "error",
	});

	const invalidate = () =>
		qc.invalidateQueries({ queryKey: invitationsQuery.queryKey });

	const handleAccept = async (invitationId: string, orgId: string) => {
		const { error } = await authClient.organization.acceptInvitation({
			invitationId,
		});
		if (error) {
			toast.error(m["member_invitations.accept_failed"]());
			return;
		}
		toast.success(m["member_invitations.joined"]());
		try {
			await switchActiveServer(orgId);
			await router.invalidate();
			router.navigate({ to: "/dashboard" });
		} catch (error) {
			toast.error(getErrorMessage(error, m["toast.switch_server_failed"]()));
		}
	};

	const handleReject = async (invitationId: string) => {
		const { error } = await authClient.organization.rejectInvitation({
			invitationId,
		});
		if (error) {
			toast.error(
				getErrorMessage(error, m["member_invitations.reject_failed"]()),
			);
			return;
		}
		toast.success(m["member_invitations.rejected"]());
		invalidate();
	};

	const pending = invitations?.filter((inv) => inv.status === "pending") ?? [];

	if (tokenStatus === "accepting") {
		return (
			<div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 p-6">
				<div className="relative flex size-20 items-center justify-center">
					{/* Animated ring */}
					<span className="absolute inset-0 animate-ping rounded-full bg-primary/20" />
					<div className="relative flex size-20 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
						<CircleNotch className="size-9 animate-spin text-primary" />
					</div>
				</div>
				<div className="text-center">
					<p className="font-bold text-xl tracking-tight">
						{m["member_invitations.accepting"]()}
					</p>
					<p className="mt-1 text-muted-foreground text-sm">
						{m["member_invitations.accepting_desc"]()}
					</p>
				</div>
			</div>
		);
	}

	if (tokenStatus === "accepted") {
		return (
			<div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 p-6">
				<div className="text-center">
					<p className="font-bold text-xl tracking-tight">
						{m["member_invitations.welcome"]()}
					</p>
					<p className="mt-1 text-muted-foreground text-sm">
						{m["member_invitations.welcome_desc"]()}
					</p>
				</div>
			</div>
		);
	}

	if (tokenStatus === "error") {
		return (
			<div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center gap-6 p-6">
				<div className="text-center">
					<p className="font-bold text-xl tracking-tight">
						{m["member_invitations.invalid"]()}
					</p>
					<p className="mt-1 max-w-xs text-muted-foreground text-sm">
						{tokenError}
					</p>
				</div>
				<Button
					variant="outline"
					onClick={() => router.navigate({ to: "/dashboard" })}
				>
					{m["member_invitations.dashboard"]()}
				</Button>
			</div>
		);
	}

	return (
		<div className={cn(PAGE_SHELL, "space-y-6")}>
			<div className="space-y-1">
				<h1 className="font-bold text-2xl tracking-tight">
					{m["member_invitations.title"]()}
				</h1>
				<p className="text-muted-foreground text-sm">
					{m["member_invitations.description"]()}
				</p>
			</div>

			{isLoading && (
				<div className="flex flex-col gap-3">
					{["s1", "s2", "s3"].map((id) => (
						<Skeleton key={id} className="h-20 w-full rounded-xl" />
					))}
				</div>
			)}

			{!isLoading && pending.length > 0 && (
				<div className="flex flex-col gap-3">
					{pending.map((inv) => {
						const expired =
							inv.expiresAt && new Date(inv.expiresAt) < new Date();
						return (
							<div
								key={inv.id}
								className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/60 px-5 py-4"
							>
								<div className="min-w-0">
									<p className="truncate font-semibold text-sm">
										{inv.organizationName}
									</p>
									<p className="mt-0.5 text-muted-foreground text-xs capitalize">
										{m["member_invitations.role"]({
											role: inv.role ?? "",
										})}
										{inv.expiresAt && (
											<>
												{" "}
												·{" "}
												{expired
													? m["member_invitations.expired"]()
													: m["member_invitations.expires"]({
															date: formatDate(inv.expiresAt),
														})}
											</>
										)}
									</p>
								</div>

								{!expired && (
									<div className="flex shrink-0 gap-2">
										<Button
											size="sm"
											onClick={() => handleAccept(inv.id, inv.serverId)}
										>
											{m["member_invitations.accept"]()}
										</Button>
										<Button
											size="sm"
											variant="outline"
											onClick={() => handleReject(inv.id)}
										>
											{m["member_invitations.reject"]()}
										</Button>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}

			{!isLoading && pending.length === 0 && (
				<EmptyState
					title={m["member_invitations.empty"]()}
					description={m["member_invitations.empty_desc"]()}
				/>
			)}
		</div>
	);
}
