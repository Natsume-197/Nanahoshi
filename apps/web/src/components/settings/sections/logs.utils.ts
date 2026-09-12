import type {
	LogEntry,
	LogLevel,
	LogSource,
} from "@nanahoshi-v2/api/lib/log-buffer";

export function normalizeLogSource(source: unknown): LogSource {
	return source === "worker" ? "worker" : "server";
}

export function filterLogEntries(
	entries: LogEntry[],
	filters: {
		query: string;
		level: "all" | LogLevel;
		source: "all" | LogSource;
		date?: string;
	},
): LogEntry[] {
	const query = filters.query.trim().toLocaleLowerCase();
	return entries
		.map((entry) => ({ ...entry, source: normalizeLogSource(entry.source) }))
		.filter((entry) => {
			if (filters.level !== "all" && entry.level !== filters.level)
				return false;
			if (filters.source !== "all" && entry.source !== filters.source)
				return false;
			if (filters.date) {
				const date = new Date(entry.timestamp);
				const localDate = [
					date.getFullYear(),
					String(date.getMonth() + 1).padStart(2, "0"),
					String(date.getDate()).padStart(2, "0"),
				].join("-");
				if (localDate !== filters.date) return false;
			}
			return (
				!query ||
				`${entry.message} ${JSON.stringify(entry.context)}`
					.toLocaleLowerCase()
					.includes(query)
			);
		})
		.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

export function formatLogContext(context: Record<string, unknown>): string {
	return Object.entries(context)
		.map(([key, value]) => {
			if (value && typeof value === "object" && !Array.isArray(value)) {
				const { stack, ...fields } = value as Record<string, unknown>;
				if (typeof stack === "string") {
					const extra = Object.fromEntries(
						Object.entries(fields).filter(
							([name, field]) =>
								!(
									(name === "type" || name === "message") &&
									typeof field === "string" &&
									stack.includes(field)
								),
						),
					);
					return `${stack}${Object.keys(extra).length ? `\n${key}: ${JSON.stringify(extra)}` : ""}`;
				}
				return `${key}: ${JSON.stringify(fields)}`;
			}
			return `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`;
		})
		.join("\n");
}

export function formatLogText(entries: LogEntry[]): string {
	return entries
		.map((entry) => {
			const context = formatLogContext(entry.context);
			return `${entry.timestamp} ${entry.level.toUpperCase()} [${entry.source}] ${entry.message}${context ? `\n${context}` : ""}`;
		})
		.join("\n");
}
