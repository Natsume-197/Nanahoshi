import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Loader2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/invite/$code")({
	component: InvitePage,
});

function InvitePage() {
	const { code } = Route.useParams();
	const router = useRouter();
	const { data: session, isPending: isSessionLoading } =
		authClient.useSession();
	const [status, setStatus] = useState<
		"idle" | "joining" | "success" | "error"
	>("idle");
	const [errorMessage, setErrorMessage] = useState("");

	// If not logged in, redirect to login with the return URL
	useEffect(() => {
		if (!isSessionLoading && !session?.user) {
			router.navigate({
				to: "/login",
				search: { redirect: `/invite/${code}` } as Record<string, string>,
			});
		}
	}, [session, isSessionLoading, router, code]);

	// Once we have a session and status is idle, auto-join
	useEffect(() => {
		if (session?.user && status === "idle") {
			handleJoin();
		}
	}, [session, handleJoin, status]);

	const handleJoin = async () => {
		setStatus("joining");
		try {
			const result = await client.inviteLinks.join({ code });
			if (result.alreadyMember) {
				toast.info("You are already a member of this organization");
			} else {
				toast.success("You have joined the organization!");
			}
			// Set the org as active and go to dashboard
			await authClient.organization.setActive({
				organizationId: result.organizationId,
			});
			setStatus("success");
			router.navigate({ to: "/dashboard" });
		} catch (err: unknown) {
			setStatus("error");
			const msg =
				err instanceof Error ? err.message : "This invite link is not valid.";
			setErrorMessage(msg);
		}
	};

	if (isSessionLoading || status === "idle") {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<Loader2 className="size-8 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (status === "joining") {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<Card className="w-full max-w-sm text-center">
					<CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
						<Loader2 className="size-10 animate-spin text-primary" />
						<p className="text-muted-foreground text-sm">
							Joining organization…
						</p>
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
