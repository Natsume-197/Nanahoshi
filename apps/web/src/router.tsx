import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { ErrorPage, NotFoundPage } from "./components/shared/error-page";
import { routeTree } from "./routeTree.gen";
import { createQueryClient, orpc, queryClient } from "./utils/orpc";

export const getRouter = () => {
	// The browser owns one long-lived cache. Every SSR request gets an isolated
	// cache so authenticated data can never be observed by another request.
	const routerQueryClient =
		typeof window === "undefined" ? createQueryClient() : queryClient;
	const router = createTanStackRouter({
		routeTree,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 30_000,
		context: { orpc, queryClient: routerQueryClient, session: null },
		defaultNotFoundComponent: () => <NotFoundPage />,
		defaultErrorComponent: ({ error }) => (
			<ErrorPage detail={error instanceof Error ? error.message : undefined} />
		),
		Wrap: ({ children }) => (
			<QueryClientProvider client={routerQueryClient}>
				{children}
			</QueryClientProvider>
		),
	});
	return router;
};

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
