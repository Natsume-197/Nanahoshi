import { ORPCError } from "@orpc/client";
import {
	Link,
	createFileRoute,
	notFound,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { ArrowLeft, BookX, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getBook } from "@/functions/books/get-book";
import { getUser } from "@/functions/get-user";

export const Route = createFileRoute("/dashboard/books/$uuid")({
	component: BookLayout,
	notFoundComponent: BookUnavailablePage,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({ to: "/login" });
		}
		return { session };
	},
	loader: async ({ params }) => {
		try {
			const book = await getBook({ data: params.uuid });
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
				<div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-border/70 bg-muted/40">
					<BookX className="size-6 text-muted-foreground" />
				</div>
				<h1 className="font-semibold text-xl tracking-tight">
					Book unavailable
				</h1>
				<p className="mt-2 text-muted-foreground text-sm">
					This book does not exist or is not available in your active
					organization.
				</p>
				<div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
					<Button variant="outline" size="lg" render={<Link to="/dashboard" />}>
						<ArrowLeft className="size-4" />
						Back to dashboard
					</Button>
					<Button
						size="lg"
						render={<Link to="/dashboard/search" search={{ q: "" }} />}
					>
						<Search className="size-4" />
						Browse books
					</Button>
				</div>
			</div>
		</div>
	);
}
