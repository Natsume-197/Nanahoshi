import { createFileRoute, useParams } from "@tanstack/react-router";
import { AudiobookDetailPage } from "@/components/audiobooks/audiobook-detail-page";

export const Route = createFileRoute("/dashboard/audiobooks/$uuid/")({
	component: AudiobookDetailRoute,
});

function AudiobookDetailRoute() {
	const { uuid } = useParams({ from: "/dashboard/audiobooks/$uuid/" });
	return <AudiobookDetailPage key={uuid} />;
}
