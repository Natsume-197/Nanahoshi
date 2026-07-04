import { createFileRoute, redirect } from "@tanstack/react-router";
import { CatalogView } from "@/components/catalog/catalog-view";

export const Route = createFileRoute("/dashboard/libraries/$uuid")({
	component: LibraryDetailPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function LibraryDetailPage() {
	const { uuid } = Route.useParams();
	return <CatalogView source={{ kind: "library", libraryUuid: uuid }} />;
}
