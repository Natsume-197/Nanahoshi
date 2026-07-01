import handler from "@tanstack/react-start/server-entry";
import { paraglideMiddleware } from "@/paraglide/server";

// Custom TanStack Start server entry (used in dev and in the built dist/server
// bundle that apps/web/server.ts serves). paraglideMiddleware resolves the
// request locale from the `locale` cookie and runs the render inside an
// AsyncLocalStorage scope so getLocale() is correct during SSR.
export default {
	fetch(request: Request): Promise<Response> {
		return paraglideMiddleware(request, () => handler.fetch(request));
	},
};
