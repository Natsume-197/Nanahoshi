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
import { useMountEffect } from "@/hooks/use-mount-effect";
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
			{
				name: "theme-color",
				content: "#1a1a1a",
			},
			{
				name: "description",
				content: "Self-hosted digital book library",
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
			{
				rel: "icon",
				type: "image/png",
				sizes: "96x96",
				href: "/favicon-96.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "48x48",
				href: "/favicon-48.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "32x32",
				href: "/favicon-32.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "192x192",
				href: "/pwa-192x192.png",
			},
			{
				rel: "apple-touch-icon",
				href: "/apple-touch-icon-180x180.png",
			},
			{
				rel: "manifest",
				href: "/manifest.webmanifest",
			},
		],
	}),

	component: RootDocument,
});

function RootDocument() {
	useMountEffect(() => {
		if ("serviceWorker" in navigator) {
			navigator.serviceWorker.register("/sw.js");
		}
	});

	return (
		<html lang="en" className="dark">
			<head>
				<HeadContent />
			</head>
			<body>
				<TooltipProvider>
					<Outlet />
				</TooltipProvider>
				<Toaster richColors />
				{/* Only include devtools in development mode and if they are successfully imported 
					{import.meta.env.DEV && RouterDevtools && QueryDevtools && (
						<Suspense fallback={null}>
							<RouterDevtools position="bottom-right" />
							<QueryDevtools position="bottom" buttonPosition="bottom-right" />
						</Suspense>
					)}
				*/}
				<Scripts />
			</body>
		</html>
	);
}
