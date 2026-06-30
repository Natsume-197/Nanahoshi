import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { Loader2, Users } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { switchActiveServer } from "@/lib/switch-server";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/invite/$code")({
	component: InvitePage,
	beforeLoad: ({ context, params }) => {
		// If not logged in, redirect to login with the return URL
		if (!context.session) {
			throw redirect({
				to: "/login",
				search: { redirect: `/invite/${params.code}` },
			});
		}
		return { session: context.session };
	},
});

function InvitePage() {
	const { code } = Route.useParams();
	const router = useRouter();
	const [status, setStatus] = useState<
		"idle" | "joining" | "success" | "error"
	>("idle");
	const [errorMessage, setErrorMessage] = useState("");
	const joinAttempted = useRef(false);

	// Auto-join on mount (Rule 4: one-time external sync)
	useMountEffect(() => {
		if (joinAttempted.current) return;
		joinAttempted.current = true;

		setStatus("joining");

		(async () => {
			try {
				const result = await client.inviteLinks.join({ code });
				if (result.alreadyMember) {
					toast.info("You are already a member of this server");
				} else {
					toast.success("You have joined the server!");
				}
				await switchActiveServer(result.serverId);

				await router.invalidate();
				setStatus("success");
				router.navigate({ to: "/dashboard" });
			} catch (err: unknown) {
				setStatus("error");
				const msg =
					err instanceof Error ? err.message : "This invite link is not valid.";
				setErrorMessage(msg);
			}
		})();
	});

	if (status === "idle" || status === "joining") {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<Card className="w-full max-w-sm text-center">
					<CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
						<Loader2 className="size-10 animate-spin text-primary" />
						<p className="text-muted-foreground text-sm">Joining server…</p>
					</CardContent>
				</Card>
			</div>
		);
	}

	if (status === "error") {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<Card className="w-full max-w-sm">
					<CardHeader className="text-center">
						<CardTitle className="text-destructive">
							Invalid Invite Link
						</CardTitle>
						<CardDescription>{errorMessage}</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col items-center gap-3">
						<Button onClick={() => router.navigate({ to: "/dashboard" })}>
							Go to Dashboard
						</Button>
					</CardContent>
				</Card>
			</div>
		);
	}

	// success — router.navigate will redirect, but render feedback anyway
	return (
		<div className="flex min-h-screen items-center justify-center p-4">
			<Card className="w-full max-w-sm text-center">
				<CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
					<Users className="size-10 text-primary" />
					<div>
						<p className="font-semibold">All done!</p>
						<p className="text-muted-foreground text-sm">
							Redirecting to dashboard…
						</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
