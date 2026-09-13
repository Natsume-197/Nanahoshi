import { env } from "@nanahoshi/env/server";
import { PostHog } from "posthog-node";

export const posthog =
	env.POSTHOG_PROJECT_TOKEN && env.POSTHOG_HOST
		? new PostHog(env.POSTHOG_PROJECT_TOKEN, {
				host: env.POSTHOG_HOST,
				enableExceptionAutocapture: true,
			})
		: null;
