import { ORPCError } from "@orpc/client";
import {
	createFileRoute,
	Link,
	notFound,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { ArrowLeft, BookX, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBook } from "@/functions/books/get-book";
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
	loader: async ({ params }) => {
		try {
			const book = await getBook({ data: params.uuid });
			// Prefetch reading progress in parallel (don't await)
			queryClient.prefetchQuery(
				orpc.readingProgress.getProgress.queryOptions({
					input: { bookUuid: params.uuid },
				}),
			);
			return { book };
		} catch (error) {
			if (error instanceof ORPCError && error.status === 404) {
				throw notFound();
			}
			throw error;
		}
	},
});

function BookLayout() {
	return <Outlet />;
}

function BookUnavailablePage() {
	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center p-6 lg:p-8">
			<div className="w-full max-w-lg rounded-xl border border-border/60 bg-card p-8 text-center">
				<div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-destructive/10">
					<BookX className="size-6 text-destructive" />
				</div>
				<h1 className="font-semibold text-xl tracking-tight">
					Book unavailable
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					This book does not exist or is not available in your active
					organization.
				</p>
				<div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
					<Button variant="outline" size="lg" asChild>
						<Link to="/dashboard">
							<ArrowLeft className="size-4" />
							Back to dashboard
						</Link>
					</Button>
					<Button size="lg" asChild>
						<Link to="/dashboard/search" search={{ q: "" }}>
							<Search className="size-4" />
							Browse books
						</Link>
					</Button>
				</div>
			</div>
		</div>
	);
}
