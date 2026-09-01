type ApiOriginOptions = {
	isSsr: boolean;
	publicOrigin: string | undefined;
	serverOrigin?: string;
};

function normalizeUrl(
	name: "SERVER_URL" | "VITE_SERVER_URL",
	value: string | undefined,
) {
	const raw = value?.trim();
	if (!raw) {
		throw new Error(`Missing environment variable: ${name}`);
	}
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new Error(`Invalid URL in environment variable: ${name}`);
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`Invalid URL in environment variable: ${name}`);
	}
	return raw.replace(/\/+$/u, "");
}

export function resolveApiOrigin({
	isSsr,
	publicOrigin,
	serverOrigin,
}: ApiOriginOptions): string {
	if (isSsr && serverOrigin?.trim()) {
		return normalizeUrl("SERVER_URL", serverOrigin);
	}
	return normalizeUrl("VITE_SERVER_URL", publicOrigin);
}

export function getApiOrigin(): string {
	return resolveApiOrigin({
		isSsr: import.meta.env.SSR,
		publicOrigin: import.meta.env.VITE_SERVER_URL,
		serverOrigin: import.meta.env.SSR ? process.env.SERVER_URL : undefined,
	});
}
