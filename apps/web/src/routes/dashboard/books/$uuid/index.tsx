import { createFileRoute } from "@tanstack/react-router";
import { BookDetailPage } from "@/components/books/book-detail-page";

export const Route = createFileRoute("/dashboard/books/$uuid/")({
	component: BookDetailPage,
});
