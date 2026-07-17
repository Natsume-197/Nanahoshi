import { ORPCError } from "@orpc/client";
import {
	createFileRoute,
	Link,
	notFound,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { getBook } from "@/functions/books/get-book";
import { useSyncActiveOrg } from "@/hooks/use-sync-active-org";
import { fetchLoaderQuery } from "@/lib/loader-query";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/books/$uuid")({
	component: BookLayout,
	notFoundComponent: BookUnavailablePage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
	loader: async ({ params, cause }) => {
		try {
			const { book, switchedOrgId } = await fetchLoaderQuery(
				queryClient,
				["loader", "book-detail", params.uuid],
				() => getBook({ data: params.uuid }),
				cause,
			);
			// Prefetch reading progress in parallel (don't await)
			queryClient.prefetchQuery(
				orpc.readingProgress.getProgress.queryOptions({
					input: { bookUuid: params.uuid },
				}),
			);
			return { book, switchedOrgId };
		} catch (error) {
			if (error instanceof ORPCError && error.status === 404) {
				throw notFound();
			}
			throw error;
		}
	},
});

function BookLayout() {
	const { switchedOrgId } = Route.useLoaderData();
	useSyncActiveOrg(switchedOrgId);
	return <Outlet />;
}

function BookUnavailablePage() {
	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-6 lg:p-8">
			<div className="w-full max-w-lg rounded-xl border border-border/60 bg-card p-8 text-center">
				<h1 className="font-semibold text-xl tracking-tight">
					Book unavailable
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					This book does not exist or is not available in your active server.
				</p>
				<div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
					<Button variant="outline" size="lg" asChild>
						<Link to="/dashboard">Back to dashboard</Link>
					</Button>
					<Button size="lg" asChild>
						<Link to="/dashboard/search" search={{ q: "" }}>
							Browse books
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
