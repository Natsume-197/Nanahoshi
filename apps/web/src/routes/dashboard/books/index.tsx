import { createFileRoute, redirect } from "@tanstack/react-router";
import {
	type CatalogFormat,
	CatalogView,
} from "@/components/catalog/catalog-view";

function parseFormat(value: unknown): CatalogFormat {
	return value === "all" || value === "audiobook" ? value : "ebook";
}

export const Route = createFileRoute("/dashboard/books/")({
	component: BooksCatalogPage,
	validateSearch: (search: Record<string, unknown>) => ({
		format: parseFormat(search.format),
	}),
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function BooksCatalogPage() {
	const { format } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<CatalogView
			source={{
				kind: "all",
				format,
				onFormatChange: (next) =>
					navigate({ search: { format: next }, replace: true }),
			}}
		/>
	);
}
