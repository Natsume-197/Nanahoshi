import { createFileRoute, redirect } from "@tanstack/react-router";
import { CatalogPage } from "@/components/catalog/catalog-page";
import { CatalogView } from "@/components/catalog/catalog-view";

export const Route = createFileRoute("/dashboard/audiobooks/")({
	component: AudiobooksCatalogPage,
	validateSearch: (search: Record<string, unknown>): { library?: string } => ({
		library: typeof search.library === "string" ? search.library : undefined,
	}),
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function AudiobooksCatalogPage() {
	const { library } = Route.useSearch();
	const navigate = Route.useNavigate();

	return (
		<CatalogPage section="audiobooks">
			<CatalogView
				source={{
					kind: "all",
					format: "audiobook",
					libraryUuid: library,
					onLibraryChange: (next) =>
						navigate({ search: { library: next }, replace: true }),
				}}
			/>
		</CatalogPage>
	);
}
