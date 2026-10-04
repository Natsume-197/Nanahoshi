import { ListItem, Text } from "@expo/ui/jetpack-compose";
import { type ReactElement, useState } from "react";
import { haptics } from "@/lib/haptics";
import { usePalette } from "@/theme";
import { ActionSheet } from "../action-menu/action-sheet";
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
					header={<SheetTitle name={collection.name} />}
					onClose={() => setOpen(false)}
				/>
			) : null}
		</>
	);
}

function SheetTitle({ name }: { name: string }) {
	const palette = usePalette();
	return (
		<ListItem colors={{ containerColor: palette.card }}>
			<ListItem.HeadlineContent>
				<Text
					color={palette.text}
					maxLines={2}
					overflow="ellipsis"
					style={{ typography: "titleMedium" }}
				>
					{name}
				</Text>
			</ListItem.HeadlineContent>
		</ListItem>
	);
}
