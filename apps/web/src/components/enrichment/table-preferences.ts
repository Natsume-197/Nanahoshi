import { z } from "zod";

export const MATCH_COLUMN_ORDER = [
	"select",
	"book",
	"match",
	"status",
	"updated",
	"actions",
];
export const DEFAULT_COLUMN_SIZING = {
	select: 40,
	book: 360,
	match: 280,
	status: 152,
	updated: 112,
	actions: 136,
};
export const DEFAULT_COLUMN_PINNING = { start: ["select"], end: ["actions"] };

const columnId = z.enum([
	"select",
	"book",
	"match",
	"status",
	"updated",
	"actions",
]);
const columns = z
	.array(columnId)
	.refine((ids) => new Set(ids).size === ids.length);
const preferencesSchema = z.object({
	order: columns.refine(
		(ids) =>
			ids.length === MATCH_COLUMN_ORDER.length &&
			ids[0] === "select" &&
			ids.at(-1) === "actions",
	),
	sizing: z.object({
		select: z.literal(40),
		book: z.number().min(240).max(2000),
		match: z.number().min(200).max(2000),
		status: z.number().min(128).max(2000),
		updated: z.number().min(96).max(2000),
		actions: z.literal(136),
	}),
	pinning: z
		.object({ start: columns, end: columns })
		.refine(({ start, end }) => !start.some((id) => end.includes(id))),
});

type TablePreferences = z.infer<typeof preferencesSchema>;
const STORAGE_KEY = "match-manager-table";

export function readTablePreferences(
	storage: Pick<Storage, "getItem">,
): TablePreferences | null {
	try {
		const parsed = preferencesSchema.safeParse(
			JSON.parse(storage.getItem(STORAGE_KEY) ?? "null"),
		);
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export function writeTablePreferences(
	storage: Pick<Storage, "setItem">,
	preferences: unknown,
) {
	try {
		storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
	} catch {
		// Table controls still work when storage is blocked or full.
	}
}
