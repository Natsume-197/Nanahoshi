/**
 * Milliseconds for a server timestamp: ISO, a Date, or Postgres' text form
 * ("2026-09-30 22:49:32.077+00") that `mode: "string"` columns send, which
 * Hermes' Date.parse rejects.
 */
export function parseServerTime(
	value: string | Date | null | undefined,
): number | null {
	if (value == null) return null;
	const time =
		value instanceof Date
			? value.getTime()
			: Date.parse(
					value
						.trim()
						.replace(" ", "T")
						.replace(/([+-]\d{2})$/, "$1:00"),
				);
	return Number.isFinite(time) ? time : null;
}
