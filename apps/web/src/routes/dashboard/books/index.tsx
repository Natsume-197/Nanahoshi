import { createFileRoute, redirect } from "@tanstack/react-router";
import { CatalogView } from "@/components/catalog/catalog-view";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/dashboard/books/")({
	component: BooksCatalogPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function BooksCatalogPage() {
	return (
		<CatalogView
			source={{ kind: "all", mediaType: "ebook", title: m["home.all_books"]() }}
		/>
	);
}
