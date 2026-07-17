import { createFileRoute, redirect } from "@tanstack/react-router";
import {
	ExploreView,
	librariesOverviewQueryOptions,
} from "@/components/explore/explore-view";

export const Route = createFileRoute("/dashboard/explore")({
	component: ExploreView,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
	},
	loader: ({ context }) => {
		if (typeof window === "undefined") return;
		void context.queryClient.prefetchQuery(librariesOverviewQueryOptions());
	},
});
