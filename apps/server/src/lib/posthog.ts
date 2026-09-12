import { env } from "@nanahoshi-v2/env/server";
import { PostHog } from "posthog-node";

function missingConfiguration(name: string): Error {
	return new Error(
		`${name} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${name} is configured`,
	);
}

if (!env.POSTHOG_PROJECT_TOKEN && env.ENVIRONMENT !== "production") {
	throw missingConfiguration("POSTHOG_PROJECT_TOKEN");
}
if (!env.POSTHOG_HOST && env.ENVIRONMENT !== "production") {
	throw missingConfiguration("POSTHOG_HOST");
}

export const posthog =
	env.POSTHOG_PROJECT_TOKEN && env.POSTHOG_HOST
		? new PostHog(env.POSTHOG_PROJECT_TOKEN, {
				host: env.POSTHOG_HOST,
				enableExceptionAutocapture: true,
			})
		: null;
