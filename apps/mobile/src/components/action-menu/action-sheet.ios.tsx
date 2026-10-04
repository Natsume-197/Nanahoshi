import type { ReactNode } from "react";
import type { MenuEntry } from "./types";

/** iOS shows actions as a UIMenu on their own trigger (ActionMenuButton), so
 * there is no detached sheet to mount. */
export function ActionSheet(_props: {
	sections: MenuEntry[][];
	header?: ReactNode;
	onClose: () => void;
}) {
	return null;
}
