import { createMiddleware, createServerFn } from "@tanstack/react-start";

// Mirrors SIDEBAR_COOKIE_NAME in components/ui/sidebar.tsx, where the shadcn
// SidebarProvider writes this cookie on every toggle.
const SIDEBAR_COOKIE_NAME = "sidebar_state";

const cookieMiddleware = createMiddleware().server(
	async ({ next, request }) => {
		return next({ context: { cookie: request.headers.get("cookie") ?? "" } });
	},
);

/**
 * Reads the persisted sidebar open/closed state from the request cookie so the
 * server can render the dashboard shell in the right state on first paint (no
 * expand/collapse flash on load). Defaults to open when no preference is stored.
 */
export const getSidebarState = createServerFn({ method: "GET" })
	.middleware([cookieMiddleware])
	.handler(({ context }) => {
		const match = context.cookie.match(
			new RegExp(`(?:^|;\\s*)${SIDEBAR_COOKIE_NAME}=([^;]+)`),
		);
		return match ? match[1] === "true" : true;
	});
