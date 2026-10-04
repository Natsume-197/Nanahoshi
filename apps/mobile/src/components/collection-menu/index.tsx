import { type ReactElement, useState } from "react";
import { haptics } from "@/lib/haptics";
import { ActionSheet } from "../action-menu/action-sheet";
import { SheetHeader } from "../sheet/rows";
import {
	type CollectionTarget,
	useCollectionMenu,
} from "./use-collection-menu";

export type { CollectionTarget } from "./model";
export { useCollectionMenu } from "./use-collection-menu";

/** Long-press a collection for its actions in a Material bottom sheet, the
 * same one titles use. */
export function CollectionMenuTarget({
	collection,
	children,
}: {
	collection: CollectionTarget;
	children: (onLongPress: (() => void) | undefined) => ReactElement;
}) {
	const [open, setOpen] = useState(false);
	const sections = useCollectionMenu(collection);
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
					header={<SheetHeader title={collection.name} />}
					onClose={() => setOpen(false)}
				/>
			) : null}
		</>
	);
}
