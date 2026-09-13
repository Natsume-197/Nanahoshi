// Published images use the browser's own origin. The optional Vite override
// keeps the separate frontend/API development workflow working.
export function resolvePublicOrigin(
	buildOrigin: string | undefined,
	browserOrigin: string | undefined,
	runtimeOrigin: string | undefined,
): string {
	const raw = buildOrigin?.trim() || browserOrigin || runtimeOrigin?.trim();
	if (!raw)
		throw new Error("Missing public URL: set APP_URL or VITE_SERVER_URL");
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error("Invalid public URL: expected http:// or https://");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("Invalid public URL: expected http:// or https://");
	}
	return raw.replace(/\/+$/u, "");
}

export const env = {
	get VITE_SERVER_URL(): string {
		return resolvePublicOrigin(
			import.meta.env.VITE_SERVER_URL,
			typeof window !== "undefined" ? window.location.origin : undefined,
			import.meta.env.SSR
				? process.env.APP_URL || process.env.SERVER_URL
				: undefined,
		);
	},
};
