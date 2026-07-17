// Validated by hand instead of zod + @t3-oss/env-core: this module sits in the
// web client's boot path, and those two pulled ~150KB (minified) of schema
// machinery into the entry bundle to check a single URL.
function requireUrl(name: string, value: unknown): string {
	const raw = typeof value === "string" && value !== "" ? value : undefined;
	if (raw === undefined) {
		throw new Error(`Missing environment variable: ${name}`);
	}
	try {
		new URL(raw);
	} catch {
		throw new Error(`Invalid URL in environment variable: ${name}`);
	}
	return raw;
}

export const env = {
	VITE_SERVER_URL: requireUrl(
		"VITE_SERVER_URL",
		import.meta.env.VITE_SERVER_URL,
	),
};
