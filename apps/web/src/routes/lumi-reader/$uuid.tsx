import { ORPCError } from "@orpc/client";
import {
	createFileRoute,
	notFound,
	redirect,
	useLoaderData,
} from "@tanstack/react-router";
import { LumiReader } from "@/components/lumi-reader/lumi-reader";
import { getBook } from "@/functions/books/get-book";
import { useSyncActiveOrg } from "@/hooks/use-sync-active-org";
import "@/components/reader/reader.css";
// Bundled CJK fonts for vertical-rl rendering.
import "@fontsource/noto-serif-jp/japanese-400.css";
import "@fontsource/noto-serif-jp/japanese-700.css";
import "@fontsource/noto-sans-jp/japanese-400.css";
import "@fontsource/noto-sans-jp/japanese-700.css";

/** Lumi-engine reader route, parallel to the ttu reader at /reader/$uuid. */
export const Route = createFileRoute("/lumi-reader/$uuid")({
	component: LumiReaderPage,
	beforeLoad: ({ context }) => {
		if (!context.session) throw redirect({ to: "/login" });
		return { session: context.session };
	},
	loader: async ({ params }) => {
		try {
			const { book, switchedOrgId } = await getBook({ data: params.uuid });
			return { book, switchedOrgId };
		} catch (error) {
			if (error instanceof ORPCError && error.status === 404) throw notFound();
			// offline: the book may still be cached in IndexedDB
			return { book: null, switchedOrgId: null };
		}
	},
});

function LumiReaderPage() {
	const { switchedOrgId } = useLoaderData({ from: "/lumi-reader/$uuid" });
	const { uuid } = Route.useParams();
	useSyncActiveOrg(switchedOrgId);
	// key remounts the reader per book.
	return <LumiReader key={uuid} uuid={uuid} />;
}
