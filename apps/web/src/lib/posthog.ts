import { env } from "@nanahoshi-v2/env/web";
import posthogJs from "posthog-js";

const projectToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const host = import.meta.env.VITE_POSTHOG_HOST;

export const posthog =
	projectToken && host && typeof window !== "undefined"
		? posthogJs.init(projectToken, {
				api_host: host,
				tracing_headers: [new URL(env.VITE_SERVER_URL).hostname],
				capture_exceptions: {
					capture_unhandled_errors: true,
					capture_unhandled_rejections: true,
					capture_console_errors: false,
				},
			})
		: null;
