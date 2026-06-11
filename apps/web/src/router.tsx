import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { ErrorPage, NotFoundPage } from "./components/shared/error-page";
import "./index.css";
import { routeTree } from "./routeTree.gen";
import { orpc, queryClient } from "./utils/orpc";

export const getRouter = () => {
	const router = createTanStackRouter({
		routeTree,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 30_000,
		context: { orpc, queryClient },
		defaultNotFoundComponent: () => <NotFoundPage />,
		defaultErrorComponent: ({ error }) => (
			<ErrorPage detail={error instanceof Error ? error.message : undefined} />
		),
		Wrap: ({ children }) => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		),
	});
	return router;
};

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
