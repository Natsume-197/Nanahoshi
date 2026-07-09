import { CircleNotch, Ticket } from "@phosphor-icons/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { ServerBadge } from "@/components/shared/server-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { switchActiveServer } from "@/lib/switch-server";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

export const Route = createFileRoute("/invite/$code")({
	component: InvitePage,
	beforeLoad: ({ context }) => {
		return { session: context.session };
	},
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
	const { session } = Route.useRouteContext();
	const router = useRouter();

	const {
		data: preview,
		isPending,
		isError,
	} = useQuery(orpc.inviteLinks.preview.queryOptions({ input: { code } }));

	const serverName = preview?.status === "ok" ? preview.serverName : "";

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
			{!session ? (
				<>
					<Button asChild className="mt-8 w-full">
						<Link to="/sign-up" search={{ redirect: `/invite/${code}` }}>
							{m["invite.create_account"]()}
						</Link>
					</Button>
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
			) : (
				<>
					<Button
						className="mt-8 w-full"
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
