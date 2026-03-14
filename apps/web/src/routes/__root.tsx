import type { QueryClient } from "@tanstack/react-query";

import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getUser } from "@/functions/get-user";
import { themeScript } from "@/lib/theme";
import type { orpc } from "@/utils/orpc";
import appCss from "../index.css?url";

const RouterDevtools = import.meta.env.DEV
	? lazy(async () => {
			const { TanStackRouterDevtools } = await import(
				"@tanstack/react-router-devtools"
			);
			return { default: TanStackRouterDevtools };
		})
	: null;

const QueryDevtools = import.meta.env.DEV
	? lazy(async () => {
			const { ReactQueryDevtools } = await import(
				"@tanstack/react-query-devtools"
			);
			return { default: ReactQueryDevtools };
		})
	: null;

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
	session: Awaited<ReturnType<typeof getUser>> | null;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	beforeLoad: async ({ context }) => {
		if (typeof window === "undefined") {
			const session = await getUser();
			return { session };
		}
		const session = await context.queryClient.ensureQueryData({
			queryKey: ["auth", "session"],
			queryFn: () => getUser(),
			staleTime: 30_000,
		});
		return { session };
	},
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Nanahoshi",
			},
		],
		links: [
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com",
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=DM+Serif+Display&display=swap",
			},
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),

	component: RootDocument,
});

function RootDocument() {
	return (
		<html lang="en" className="dark" suppressHydrationWarning>
			<head>
				{/* biome-ignore lint/security/noDangerouslySetInnerHtml: static theme script, no user input */}
				<script dangerouslySetInnerHTML={{ __html: themeScript }} />
				<HeadContent />
			</head>
			<body>
				<TooltipProvider>
					<Outlet />
				</TooltipProvider>
				<Toaster richColors />
				{import.meta.env.DEV && RouterDevtools && QueryDevtools && (
					<Suspense fallback={null}>
						<RouterDevtools position="bottom-right" />
						<QueryDevtools position="bottom" buttonPosition="bottom-right" />
					</Suspense>
				)}
				<Scripts />
			</body>
		</html>
	);
}
