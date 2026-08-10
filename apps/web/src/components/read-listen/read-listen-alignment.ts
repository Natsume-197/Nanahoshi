import type { ReadListenAlignmentView } from "@nanahoshi-v2/api/routers/read-listen/read-listen.service";

/** Repairs pairings persisted before the alignment lifecycle was introduced. */
export function resolveReadListenAlignment(
	alignment: ReadListenAlignmentView | undefined,
): ReadListenAlignmentView {
	return alignment ?? { status: "not_imported" };
}
