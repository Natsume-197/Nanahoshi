import { createFileRoute, redirect } from "@tanstack/react-router";
import { ReadListenCatalogPage } from "@/components/read-listen/read-listen-catalog-page";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/dashboard/read-listen")({
	component: ReadListenPage,
	validateSearch: (search: Record<string, unknown>) => ({
		review: search.review === "matches" ? ("matches" as const) : undefined,
	}),
	head: () => ({
		meta: [{ title: `${m["nav.read_listen"]()} · Nanahoshi` }],
	}),
	beforeLoad: ({ context }) => {
		if (!context.session) throw redirect({ to: "/login" });
	},
});

function ReadListenPage() {
	return <ReadListenCatalogPage />;
}
