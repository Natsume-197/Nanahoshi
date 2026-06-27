import type { QueryClient } from "@tanstack/react-query";

import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AudioPlayerProvider } from "@/context/audio-player-context";
import { getUser } from "@/functions/get-user";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useWindowEvent } from "@/hooks/use-window-event";
import { flushPendingProgress } from "@/lib/reader/pending-progress";
import type { orpc } from "@/utils/orpc";
import appCss from "../index.css?url";

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
				// `maximum-scale=1, user-scalable=no` must be in the initial HTML
				// (setting it later does not re-evaluate the layout viewport). It
				// stops mobile "shrink-to-fit": the continuous reader lays vertical-rl
				// columns wider than the screen, and without this the browser zooms
				// out to fit, ballooning the layout viewport to several screens tall —
				// which pushes the fixed footer counter off-screen, mis-sizes the
				// settings overlay, and leaves a phantom Y scrollbar that scrolls on
				// touch. App-wide zoom-lock is the standard tradeoff for an app-like
				// reading UI.
				name: "viewport",
				content:
					"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
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
			navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
		}
		// without persist() the browser may evict IndexedDB under disk pressure
		navigator.storage?.persist?.().catch(() => {});
		flushPendingProgress();
	});

	useWindowEvent("online", () => {
		flushPendingProgress();
	});

	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: inline blocking theme script (static string, no user input) that sets the theme class before first paint
					dangerouslySetInnerHTML={{
						__html: `(function(){var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);var t=m&&m[1];var d=t==='light'?false:t==='system'?window.matchMedia('(prefers-color-scheme: dark)').matches:true;if(d)document.documentElement.classList.add('dark')})()`,
					}}
				/>
				<HeadContent />
			</head>
			<body>
				<TooltipProvider>
					<AudioPlayerProvider>
						<Outlet />
					</AudioPlayerProvider>
				</TooltipProvider>
				<Toaster richColors />
				<Scripts />
			</body>
		</html>
	);
}
