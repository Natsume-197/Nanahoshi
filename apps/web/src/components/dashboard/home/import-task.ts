import type { Task } from "@nanahoshi-v2/api/modules/taskManager";

// A first scan/upload populates an otherwise empty server. While one of these
// runs, the home shows import progress instead of the "nothing here" card so
// the admin isn't left staring at an empty page wondering whether it worked.
export const IMPORT_TASK_TYPES: ReadonlySet<string> = new Set([
	"library-scan",
	"library-upload",
	"library-reprocess",
	"library-regroup",
]);

/** The running import task to surface on the empty home, or null. Type-only
 * import keeps this a pure module (no server code) so it's cheap to unit-test. */
export function pickActiveImport(tasks: Task[] | undefined): Task | null {
	return (
		(tasks ?? []).find(
			(task) => task.status === "running" && IMPORT_TASK_TYPES.has(task.type),
		) ?? null
	);
}
