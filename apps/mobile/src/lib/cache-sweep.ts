import { File, Paths } from "expo-file-system";
import { isLeftover } from "./cache-leftovers";

const MARKER = new File(Paths.document, ".cache-swept-v1");

/** Once per install: clears what older builds left in the cache. */
export function sweepLeftoverCache() {
	if (MARKER.exists) return;
	try {
		for (const item of Paths.cache.list())
			if (item instanceof File && isLeftover(item.uri, item.size ?? 0))
				item.delete();
		MARKER.write("");
	} catch {
		// Housekeeping only: tried again next launch.
	}
}
