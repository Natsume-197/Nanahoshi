import { env } from "@nanahoshi-v2/env/server";

const MANAGED_PREFIXES = [
	"/api/data/avatars/",
	"/api/data/headers/",
	"/api/data/server-logos/",
	"/api/data/server-backgrounds/",
] as const;

export function isManagedMediaUrl(value: string): boolean {
	try {
		const candidate = new URL(value);
		const server = new URL(env.SERVER_URL);
		return (
			candidate.origin === server.origin &&
			MANAGED_PREFIXES.some((prefix) => candidate.pathname.startsWith(prefix))
		);
	} catch {
		return false;
	}
}
