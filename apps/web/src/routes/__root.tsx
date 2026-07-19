import type { QueryClient } from "@tanstack/react-query";

import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { SettingsModalHost } from "@/components/layout/settings-modal-host";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AudioPlayerProvider } from "@/context/audio-player-context";
import { LocaleContext } from "@/context/locale-context";
import { getUser } from "@/functions/get-user";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useWindowEvent } from "@/hooks/use-window-event";
import { flushPendingProgress } from "@/lib/reader/pending-progress";
import { refreshThemeColor } from "@/lib/theme-color";
import {
	applyPaletteVars,
	getStoredPalette,
	PALETTE_VAR_NAMES,
	storePalette,
} from "@/lib/theme-palettes";
import {
	getLocale,
	type Locale,
	setLocale as paraglideSetLocale,
} from "@/paraglide/runtime";
import { type orpc, setupQueryPersistence } from "@/utils/orpc";
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
			// Sign-out / server switch invalidate this key explicitly; a short
			// staleTime here would put a getUser round-trip on the nav critical path.
			staleTime: 5 * 60_000,
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
					"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content",
			},
			{
				title: "Nanahoshi",
			},
			{
				name: "description",
				content: "Self-hosted digital book library",
			},
			{
				name: "application-name",
				content: "Nanahoshi",
			},
			{
				name: "mobile-web-app-capable",
				content: "yes",
			},
			{
				name: "apple-mobile-web-app-capable",
				content: "yes",
			},
			{
				name: "apple-mobile-web-app-title",
				content: "Nanahoshi",
			},
			{
				// Keep the installed iOS status bar opaque; the layout already
				// accounts for its safe area and does not use glass materials.
				name: "apple-mobile-web-app-status-bar-style",
				content: "default",
			},
			{
				name: "format-detection",
				content: "telephone=no",
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
	// Locale lives in state so a language switch re-renders instantly (no page
	// reload). `setLocale` persists the cookie with reload disabled; the `key` on
	// the routed subtree below remounts it so every m.*() re-resolves — including
	// React.memo'd components. Kept below AudioPlayerProvider so audio keeps
	// playing across a language change.
	const [locale, setLocaleState] = useState<Locale>(getLocale);
	const setLocale = useCallback((next: Locale) => {
		// Persist to the Paraglide cookie (no page reload); state drives the remount.
		paraglideSetLocale(next, { reload: false });
		setLocaleState(next);
	}, []);

	useMountEffect(() => {
		// The blocking script restores only whitelisted resolved vars for first
		// paint. Hydration then normalizes recipes and persists that repaired form,
		// preventing stale legacy values from flashing again on the next visit.
		const palette = getStoredPalette();
		applyPaletteVars(palette?.vars ?? null);
		storePalette(palette);
		refreshThemeColor();
		// After hydration on purpose: restoring the persisted cache earlier makes
		// the first client render disagree with the SSR HTML (see orpc.ts).
		setupQueryPersistence();
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
		<html lang={locale} suppressHydrationWarning>
			<head>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: inline blocking theme script (static string, no user input) that sets the theme class before first paint
					dangerouslySetInnerHTML={{
						// Also creates the theme-color meta (browser/OS navbar tint) so it
						// exists before first paint and stays outside React's head — the
						// hexes mirror --background in index.css; lib/theme-color.ts mutates
						// the tag at runtime (reader themes, light/dark switches).
						__html: `(function(){var m=document.cookie.match(/(?:^|; )theme=([^;]*)/);var t=m&&m[1];var d=t==='light'?false:t==='system'?window.matchMedia('(prefers-color-scheme: dark)').matches:true;if(d)document.documentElement.classList.add('dark');var c=d?'#1a1a1e':'#f7f7f7';var a=${JSON.stringify(PALETTE_VAR_NAMES)};try{var p=JSON.parse(localStorage.getItem('theme-palette'));if(p&&p.vars){for(var k in p.vars)if(a.indexOf(k)!==-1&&typeof p.vars[k]==='string')document.documentElement.style.setProperty(k,p.vars[k]);if(typeof p.vars['--background']==='string')c=p.vars['--background']}}catch(e){}var mt=document.createElement('meta');mt.name='theme-color';mt.content=c;document.head.appendChild(mt)})()`,
					}}
				/>
				<HeadContent />
			</head>
			{/* suppressHydrationWarning: browser extensions (e.g. asbplayer) inject
			    className/tabindex on <body> before React hydrates. We render no
			    dynamic body attributes, so suppressing this element's own mismatch
			    is safe. It does not cover descendants — extensions that rewrite page
			    text (token-mining) can still cause deeper mismatches. */}
			<body suppressHydrationWarning>
				<LocaleContext value={{ locale, setLocale }}>
					<TooltipProvider>
						{/* Settings modals live above the locale key so switching
						    language re-renders them in place instead of closing them. */}
						<SettingsModalHost>
							<AudioPlayerProvider>
								{/* key={locale} remounts the routed tree on a language
								    switch so memo'd components re-run their m.*() calls. */}
								<Outlet key={locale} />
							</AudioPlayerProvider>
						</SettingsModalHost>
					</TooltipProvider>
				</LocaleContext>
				<Toaster />
				<Scripts />
			</body>
		</html>
	);
}
