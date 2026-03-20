import { createFileRoute, useParams } from "@tanstack/react-router";
import { BookDetailPage } from "@/components/books/book-detail-page";

export const Route = createFileRoute("/dashboard/books/$uuid/")({
	component: BookDetailRoute,
});

function BookDetailRoute() {
	const { uuid } = useParams({ from: "/dashboard/books/$uuid/" });
	return <BookDetailPage key={uuid} />;
}
