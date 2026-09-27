import { createFileRoute, redirect } from "@tanstack/react-router";
import { LibraryHub } from "@/components/dashboard/library-hub";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/dashboard/library")({
	component: LibraryHub,
	head: () => ({
		meta: [{ title: `${m["nav.library"]()} · Nanahoshi` }],
	}),
	beforeLoad: ({ context }) => {
		if (!context.session) throw redirect({ to: "/login" });
	},
});
