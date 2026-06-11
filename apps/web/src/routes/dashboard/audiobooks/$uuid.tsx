import { ORPCError } from "@orpc/client";
import {
	createFileRoute,
	Link,
	notFound,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getAudiobook } from "@/functions/books/get-audiobook";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/audiobooks/$uuid")({
	component: AudiobookLayout,
	notFoundComponent: AudiobookUnavailablePage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
	loader: async ({ params }) => {
		try {
			const audiobook = await getAudiobook({ data: params.uuid });
			if (!audiobook) throw notFound();
			// Prefetch listening progress
			queryClient.prefetchQuery(
				orpc.listeningProgress.getProgress.queryOptions({
					input: { bookUuid: params.uuid },
				}),
			);
			return { audiobook };
		} catch (error) {
			if (error instanceof ORPCError && error.status === 404) {
				throw notFound();
			}
			throw error;
		}
	},
});

function AudiobookLayout() {
	return <Outlet />;
}

function AudiobookUnavailablePage() {
	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-6 lg:p-8">
			<div className="w-full max-w-lg rounded-xl border border-border/60 bg-card p-8 text-center">
				<h1 className="font-semibold text-xl tracking-tight">
					Audiobook unavailable
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					This audiobook does not exist or is not available in your active
					organization.
				</p>
				<div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
					<Button variant="outline" size="lg" asChild>
						<Link to="/dashboard">Back to dashboard</Link>
					</Button>
					<Button size="lg" asChild>
						<Link to="/dashboard/search" search={{ q: "" }}>
							Browse library
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
