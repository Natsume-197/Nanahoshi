import { createFileRoute, redirect } from "@tanstack/react-router";

// The audiobook catalog is the unified browse catalog with the format facet
// pinned; this route only survives as a stable inbound link.
export const Route = createFileRoute("/dashboard/audiobooks/")({
	beforeLoad: () => {
		throw redirect({
			to: "/dashboard/books",
			search: { format: "audiobook" },
		});
	},
});
