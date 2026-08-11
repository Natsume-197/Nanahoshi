import { createFileRoute, redirect } from "@tanstack/react-router";

// Kept as a redirect so existing links and bookmarks don't 404.
export const Route = createFileRoute("/dashboard/explore")({
	beforeLoad: () => {
		throw redirect({ to: "/dashboard/books", search: {} });
	},
});
