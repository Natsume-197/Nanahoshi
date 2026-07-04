import { createFileRoute, redirect } from "@tanstack/react-router";
import { CatalogView } from "@/components/catalog/catalog-view";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/dashboard/audiobooks/")({
	component: AudiobooksCatalogPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
});

function AudiobooksCatalogPage() {
	return (
		<CatalogView
			source={{
				kind: "all",
				mediaType: "audiobook",
				title: m["home.all_audiobooks"](),
			}}
		/>
	);
}
