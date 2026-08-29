/**
 * Hand-rolled `validateSearch` helpers for trivial shapes. Route config is part
 * of the client entry bundle (only components get code-split), so a zod schema
 * here would drag all of zod (~150KB minified) into the boot path.
 */

/** Optional in-app path (must start with "/"); anything else becomes undefined. */
export function optionalAppPath(value: unknown): string | undefined {
	return typeof value === "string" && value.startsWith("/") ? value : undefined;
}

/** Optional non-empty string; anything else becomes undefined. */
export function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value !== "" ? value : undefined;
}

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Optional canonical UUID without pulling a schema library into route config. */
export function optionalUuid(value: unknown): string | undefined {
	return typeof value === "string" && UUID_PATTERN.test(value)
		? value
		: undefined;
}
