import { radius, sizes, usePalette } from "@/theme";
import { ActionMenuButton } from "../action-menu";
import { icons } from "../icon-names";
import type { BookTarget } from "./model";
import { useBookMenu } from "./use-book-menu";

/** The "more" button on detail pages: the title's actions on a tap. `plain`
 * is the bare icon of the detail hero's action row. */
export function BookMenuButton({
	target,
	label,
	plain = false,
}: {
	target: BookTarget;
	label: string;
	plain?: boolean;
}) {
	const palette = usePalette();
	const { items } = useBookMenu(target, true);
	const ios = process.env.EXPO_OS === "ios";
	return (
		<ActionMenuButton
			sections={items}
			label={label}
			icon={icons.more}
			color={palette.text}
			size={plain ? 22 : ios ? 18 : 20}
			box={plain ? 40 : ios ? 44 : sizes.chip}
			background={plain ? undefined : palette.surface}
			radius={radius.field}
		/>
	);
}
