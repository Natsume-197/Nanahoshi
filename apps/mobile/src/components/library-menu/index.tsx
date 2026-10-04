import { type ReactElement, useState } from "react";
import { haptics } from "@/lib/haptics";
import { ActionSheet } from "../action-menu/action-sheet";
import { SheetHeader } from "../sheet/rows";
import { type LibraryTarget, useLibraryMenu } from "./use-library-menu";

export type { LibraryTarget } from "./model";

/** Long-press a library for its actions in the Material sheet titles use. */
export function LibraryMenuTarget({
	library,
	children,
}: {
	library: LibraryTarget;
	children: (onLongPress: (() => void) | undefined) => ReactElement;
}) {
	const [open, setOpen] = useState(false);
	const sections = useLibraryMenu(library);
	if (sections.length === 0) return children(undefined);
	return (
		<>
			{children(() => {
				haptics.longPress();
				setOpen(true);
			})}
			{open ? (
				<ActionSheet
					sections={sections}
					header={<SheetHeader title={library.name} />}
					onClose={() => setOpen(false)}
				/>
			) : null}
		</>
	);
}
