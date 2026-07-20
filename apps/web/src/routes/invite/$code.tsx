import { CircleNotch, Ticket } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	type SearchSchemaInput,
	useRouter,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { OAuthErrorNotice } from "@/components/forms/oauth-error-notice";
import { DiscordIcon } from "@/components/shared/discord-icon";
import { ServerBadge } from "@/components/shared/server-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { authClient } from "@/lib/auth-client";
import { buildInviteHead } from "@/lib/invite-meta";
import { optionalString } from "@/lib/search-validators";
import { switchActiveServer } from "@/lib/switch-server";
import { m } from "@/paraglide/messages";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/invite/$code")({
	component: InvitePage,
	validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
		// OAuth callback failures land back here as ?error=<code>.
		error: optionalString(search.error),
	}),
	beforeLoad: ({ context }) => {
		return { session: context.session };
	},
	loader: async ({ params }) => {
		// SSR calls the API directly: the server query client is process-wide and
		// preview.alreadyMember is per-user, so it must never be cached there. On
		// the client the fetch goes through the cache, so the component's useQuery
		// reuses this same request instead of firing a second one.
		try {
			const preview =
				typeof window === "undefined"
					? await client.inviteLinks.preview({ code: params.code })
					: await queryClient.ensureQueryData(
							orpc.inviteLinks.preview.queryOptions({
								input: { code: params.code },
							}),
						);
			return { preview };
		} catch {
			// Meta tags are best-effort; the component's own query surfaces errors.
			return { preview: null };
		}
	},
	head: ({ loaderData }) => buildInviteHead(loaderData?.preview),
});

const ERROR_DESCRIPTIONS = {
	invalid: m["invite.err_invalid"],
	expired: m["invite.err_expired"],
	revoked: m["invite.err_revoked"],
	exhausted: m["invite.err_exhausted"],
};

function InviteShell({
	children,
	background,
}: {
	children: ReactNode;
	background?: string | null;
}) {
	return (
		<main className="relative flex min-h-svh items-center justify-center overflow-hidden bg-background px-4 py-12">
			{background && (
				<div aria-hidden className="pointer-events-none absolute inset-0">
					<img src={background} alt="" className="h-full w-full object-cover" />
					{/* Blurred scrim keeps the card legible over any image, both themes. */}
					<div className="absolute inset-0 bg-background/60 backdrop-blur-md" />
				</div>
			)}
			<div className="fade-in-0 zoom-in-95 relative w-full max-w-sm animate-in rounded-2xl border bg-card p-8 text-center shadow-lg duration-300 motion-reduce:animate-none">
				{children}
			</div>
		</main>
	);
}

function InvitePage() {
	const { code } = Route.useParams();
	const { error: oauthError } = Route.useSearch();
	const { session } = Route.useRouteContext();
	const router = useRouter();

	const {
		data: preview,
		isPending,
		isError,
	} = useQuery(orpc.inviteLinks.preview.queryOptions({ input: { code } }));
	const { data: sso } = useQuery(orpc.setup.ssoStatus.queryOptions());

	const serverName = preview?.status === "ok" ? preview.serverName : "";

	// Which registration paths the instance offers to a visitor without account.
	const signupClosed = sso?.signup.policy === "closed";
	const emailSignUp = !signupClosed && (sso?.signup.email ?? false);
	const discordSignUp = !signupClosed && (sso?.signup.discord ?? false);
	const requiresDiscord = preview?.status === "ok" && preview.requiresDiscord;

	const inviteUrl = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${code}`;
	const startDiscordSignUp = () =>
		authClient.signIn.social({
			provider: "discord",
			callbackURL: inviteUrl,
			errorCallbackURL: inviteUrl,
			// Better Auth persists additionalData in its protected OAuth state and
			// restores it on the Discord callback.
			additionalData: { inviteCode: code },
		});
	const startDiscordLink = () =>
		authClient.linkSocial({
			provider: "discord",
			callbackURL: inviteUrl,
			errorCallbackURL: inviteUrl,
		});

	const join = useMutation(
		orpc.inviteLinks.join.mutationOptions({
			onSuccess: async (result) => {
				if (!result.alreadyMember) {
					toast.success(m["invite.join_success"]({ name: serverName }));
				}
				await switchActiveServer(result.serverId);
				await router.invalidate();
				router.navigate({ to: "/dashboard" });
			},
			onError: (err) => toast.error(err.message),
		}),
	);

	const handleOpenServer = async () => {
		if (preview?.status !== "ok") return;
		await switchActiveServer(preview.serverId);
		await router.invalidate();
		router.navigate({ to: "/dashboard" });
	};

	if (isPending) {
		return (
			<InviteShell>
				<Skeleton className="mx-auto size-16 rounded-2xl" />
				<Skeleton className="mx-auto mt-6 h-4 w-44" />
				<Skeleton className="mx-auto mt-2 h-8 w-52" />
				<Skeleton className="mx-auto mt-3 h-4 w-40" />
				<Skeleton className="mt-8 h-10 w-full" />
				<Skeleton className="mt-2 h-10 w-full" />
			</InviteShell>
		);
	}

	if (isError || !preview || preview.status !== "ok") {
		const description =
			preview && preview.status !== "ok"
				? ERROR_DESCRIPTIONS[preview.status]()
				: m["invite.err_invalid"]();
		return (
			<InviteShell>
				<div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-muted">
					<Ticket className="size-7 text-muted-foreground" />
				</div>
				<h1 className="mt-6 text-balance font-bold text-2xl tracking-tight">
					{m["invite.invalid_title"]()}
				</h1>
				<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
					{description}
				</p>
				<Button
					className="mt-8 w-full"
					onClick={() =>
						router.navigate({ to: session ? "/dashboard" : "/login" })
					}
				>
					{session ? m["invite.go_dashboard"]() : m["auth.sign_in"]()}
				</Button>
			</InviteShell>
		);
	}

	return (
		<InviteShell background={preview.serverBackground}>
			<ServerBadge
				name={preview.serverName}
				logo={preview.serverLogo}
				className="mx-auto size-16 rounded-2xl text-xl"
			/>
			<p className="mt-6 text-muted-foreground text-sm">
				{m["invite.invited_to_join"]()}
			</p>
			<h1 className="mt-1 text-balance font-bold text-2xl tracking-tight">
				{preview.serverName}
			</h1>
			<div className="mt-3 flex items-center justify-center gap-4 text-muted-foreground text-sm">
				<span className="flex items-center gap-1.5">
					<span aria-hidden className="size-2 rounded-full bg-primary" />
					{m["invite.member_count"]({ count: preview.memberCount })}
				</span>
				<span className="flex items-center gap-1.5">
					<span
						aria-hidden
						className="size-2 rounded-full bg-muted-foreground/40"
					/>
					{m["invite.book_count"]({ count: preview.bookCount })}
				</span>
			</div>
			<div className="mt-4 empty:hidden">
				<OAuthErrorNotice code={oauthError} />
			</div>
			{!session ? (
				<>
					{signupClosed || (!emailSignUp && !discordSignUp) ? (
						<p className="mt-8 rounded-lg border border-border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
							{m["invite.signup_closed"]()}
						</p>
					) : requiresDiscord && discordSignUp ? (
						<>
							<p className="mt-8 text-muted-foreground text-sm">
								{m["invite.requires_discord"]()}
							</p>
							<Button className="mt-3 w-full" onClick={startDiscordSignUp}>
								<DiscordIcon className="mr-2 size-4" />
								{m["invite.continue_discord"]()}
							</Button>
							{emailSignUp && (
								<p className="mt-4 text-muted-foreground text-sm">
									<Link
										to="/sign-up"
										search={{ redirect: `/invite/${code}` }}
										className="font-medium text-foreground underline-offset-4 hover:underline"
									>
										{m["invite.create_account_email"]()}
									</Link>
								</p>
							)}
						</>
					) : emailSignUp ? (
						<>
							<Button asChild className="mt-8 w-full">
								<Link to="/sign-up" search={{ redirect: `/invite/${code}` }}>
									{m["invite.create_account"]()}
								</Link>
							</Button>
							{discordSignUp && (
								<Button
									variant="outline"
									className="mt-2 w-full"
									onClick={startDiscordSignUp}
								>
									<DiscordIcon className="mr-2 size-4" />
									{m["invite.continue_discord"]()}
								</Button>
							)}
						</>
					) : (
						<Button className="mt-8 w-full" onClick={startDiscordSignUp}>
							<DiscordIcon className="mr-2 size-4" />
							{m["invite.continue_discord"]()}
						</Button>
					)}
					<p className="mt-4 text-muted-foreground text-sm">
						{m["auth.have_account"]()}{" "}
						<Link
							to="/login"
							search={{ redirect: `/invite/${code}` }}
							className="font-medium text-foreground underline-offset-4 hover:underline"
						>
							{m["auth.sign_in_link"]()}
						</Link>
					</p>
				</>
			) : preview.alreadyMember ? (
				<>
					<p className="mt-8 text-muted-foreground text-sm">
						{m["invite.already_member"]()}
					</p>
					<Button className="mt-3 w-full" onClick={handleOpenServer}>
						{m["invite.open_server"]()}
					</Button>
				</>
			) : requiresDiscord && !preview.discordLinked ? (
				<>
					<p className="mt-8 text-muted-foreground text-sm">
						{m["invite.link_discord_required"]()}
					</p>
					<Button className="mt-3 w-full" onClick={startDiscordLink}>
						<DiscordIcon className="mr-2 size-4" />
						{m["invite.link_discord"]()}
					</Button>
					<Button
						variant="ghost"
						className="mt-2 w-full text-muted-foreground"
						onClick={() => router.navigate({ to: "/dashboard" })}
					>
						{m["invite.no_thanks"]()}
					</Button>
				</>
			) : (
				<>
					{requiresDiscord && (
						<p className="mt-8 text-muted-foreground text-sm">
							{m["invite.requires_discord_ready"]()}
						</p>
					)}
					<Button
						className={requiresDiscord ? "mt-3 w-full" : "mt-8 w-full"}
						disabled={join.isPending}
						onClick={() => join.mutate({ code })}
					>
						{join.isPending && <CircleNotch className="size-4 animate-spin" />}
						{m["invite.accept_as"]({ name: session.user.name })}
					</Button>
					<Button
						variant="ghost"
						className="mt-2 w-full text-muted-foreground"
						disabled={join.isPending}
						onClick={() => router.navigate({ to: "/dashboard" })}
					>
						{m["invite.no_thanks"]()}
					</Button>
				</>
			)}
		</InviteShell>
	);
}
