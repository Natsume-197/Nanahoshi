import { ORPCError } from "@orpc/client";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import {
	ReaderRoutePending,
	ReaderScreen,
} from "@/features/reader/reader-screen";
import { getBook } from "@/functions/books/get-book";
import { optionalUuid } from "@/lib/search-validators";

export const Route = createFileRoute("/reader/$uuid")({
	component: ReaderRoute,
	pendingComponent: ReaderRoutePending,
	pendingMs: 0,
	pendingMinMs: 0,
	validateSearch: (search: Record<string, unknown>): { pair?: string } => {
		const pair = optionalUuid(search.pair);
		return pair ? { pair } : {};
	},
	beforeLoad: ({ context }) => {
		if (!context.session) throw redirect({ to: "/login" });
		return { session: context.session };
	},
	loader: async ({ params }) => {
		try {
			return await getBook({ data: params.uuid });
		} catch (error) {
			if (error instanceof ORPCError && error.status === 404) throw notFound();
			throw error;
		}
	},
});

function ReaderRoute() {
	const { book, switchedOrgId } = Route.useLoaderData();
	const { uuid } = Route.useParams();
	const { pair } = Route.useSearch();
	return (
		<ReaderScreen
			book={book}
			switchedOrgId={switchedOrgId}
			uuid={uuid}
			readListenPairUuid={pair}
		/>
	);
}
