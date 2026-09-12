import { env } from "@nanahoshi-v2/env/web";
import posthogJs from "posthog-js";

const projectToken = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN;
const host = import.meta.env.VITE_POSTHOG_HOST;
const tracingHeaderHostname = new URL(env.VITE_SERVER_URL).hostname;

function missingConfiguration(name: string): Error {
	return new Error(
		`${name} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${name} is configured`,
	);
}

if (!projectToken && import.meta.env.DEV) {
	throw missingConfiguration("VITE_POSTHOG_PROJECT_TOKEN");
}
if (!host && import.meta.env.DEV) {
	throw missingConfiguration("VITE_POSTHOG_HOST");
}

export const posthog =
	projectToken && host && typeof window !== "undefined"
		? posthogJs.init(projectToken, {
				api_host: host,
				tracing_headers: [tracingHeaderHostname],
				capture_exceptions: {
					capture_unhandled_errors: true,
					capture_unhandled_rejections: true,
					capture_console_errors: false,
				},
			})
		: null;
