import type { ReactNode } from "react";
import type { MenuItem } from "./types";

/** iOS shows actions as a UIMenu on their own trigger (ActionMenuButton), so
 * there is no detached sheet to mount. */
export function ActionSheet(_props: {
	sections: MenuItem[][];
	header?: ReactNode;
	tone?: unknown;
	onClose: () => void;
}) {
	return null;
}
