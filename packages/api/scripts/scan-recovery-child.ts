import { pool } from "@nanahoshi-v2/db";
import { scanPathLibrary } from "../src/modules/scanning/libraryScanner";

const [root, libraryIdValue, libraryPathIdValue, taskId] = Bun.argv.slice(2);
const libraryId = Number(libraryIdValue);
const libraryPathId = Number(libraryPathIdValue);

if (
	!root ||
	!taskId ||
	!Number.isInteger(libraryId) ||
	!Number.isInteger(libraryPathId)
) {
	throw new Error(
		"Usage: scan-recovery-child.ts <root> <libraryId> <libraryPathId> <taskId>",
	);
}

let exitCode = 0;
try {
	await scanPathLibrary(
		root,
		libraryId,
		libraryPathId,
		taskId,
		"ebook",
		"full",
	);
} catch (error) {
	exitCode = 1;
	console.error(error);
} finally {
	await pool.end().catch(() => {});
}

// This harness intentionally models a process boundary. BullMQ owns shared
// Redis handles that would otherwise keep the child alive after its work ends.
process.exit(exitCode);
