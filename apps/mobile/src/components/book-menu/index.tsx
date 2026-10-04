import { Host } from "@expo/ui";
import { Box, DropdownMenu, RNHostView } from "@expo/ui/jetpack-compose";
import { size } from "@expo/ui/jetpack-compose/modifiers";
import { createContext, type ReactNode, use, useRef, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import { titleOrUntitled } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { usePalette } from "@/theme";
import { ComposeMenuItems } from "../action-menu";
import { ActionSheet } from "../action-menu/action-sheet";
import type { MenuItem } from "../action-menu/types";
import { Cover } from "../cover";
import { SheetHeader } from "../sheet/rows";
import { type MenuAnchor, measureMenuAnchor } from "./anchor";
import type { BookTarget } from "./model";
import type { BookMenuTargetProps } from "./types";
import { useBookMenu } from "./use-book-menu";

export { BookMenuButton } from "./button";
export type { BookTarget } from "./model";

type Presentation = "sheet" | "dropdown";
type Selection = {
	target: BookTarget;
	anchor: MenuAnchor;
	presentation: Presentation;
};

const OpenContext = createContext<
	(target: BookTarget, source: View | null, presentation: Presentation) => void
>(() => undefined);

/** Hosts the one Compose menu the tabs share; any long-press below opens it. */
export function BookMenuProvider({ children }: { children: ReactNode }) {
	const [selection, setSelection] = useState<Selection | null>(null);
	const open = (
		target: BookTarget,
		source: View | null,
		presentation: Presentation,
	) =>
		measureMenuAnchor(source, (anchor) =>
			setSelection({ target, anchor, presentation }),
		);
	return (
		<OpenContext value={open}>
			{children}
			{selection ? (
				<ComposeMenu
					key={`${selection.target.uuid}:${selection.presentation}`}
					selection={selection}
					close={() => setSelection(null)}
				/>
			) : null}
		</OpenContext>
	);
}

/**
 * Long-press on phones raises a Material bottom sheet (the Play Books / YT
 * Music pattern); on tablets the menu drops down from the item instead.
 */
export function BookMenuTarget({
	target,
	style,
	children,
}: BookMenuTargetProps) {
	const open = use(OpenContext);
	const source = useRef<View>(null);
	const { width, height } = useWindowDimensions();
	const presentation: Presentation =
		Math.min(width, height) >= 600 ? "dropdown" : "sheet";
	return (
		<View ref={source} collapsable={false} style={style}>
			{children(() => {
				haptics.longPress();
				open(target, source.current, presentation);
			})}
		</View>
	);
}

function ComposeMenu({
	selection,
	close,
}: {
	selection: Selection;
	close: () => void;
}) {
	const palette = usePalette();
	const { target, anchor, presentation } = selection;
	const { items } = useBookMenu(target, true);
	const choose = (item: MenuItem) => {
		close();
		item.onPress();
	};

	if (presentation === "dropdown")
		return (
			<Host
				style={{
					position: "absolute",
					left: anchor.x,
					top: anchor.y,
					width: anchor.width,
					height: anchor.height,
				}}
				pointerEvents="none"
			>
				<DropdownMenu expanded onDismissRequest={close} color={palette.card}>
					<DropdownMenu.Trigger>
						<Box modifiers={[size(anchor.width, anchor.height)]} />
					</DropdownMenu.Trigger>
					<DropdownMenu.Items>
						<ComposeMenuItems sections={items} onChoose={choose} />
					</DropdownMenu.Items>
				</DropdownMenu>
			</Host>
		);

	return (
		<ActionSheet
			sections={items}
			header={<Header target={target} />}
			onClose={close}
		/>
	);
}

/** Cover, title and author, so the sheet says which title it acts on. */
function Header({ target }: { target: BookTarget }) {
	const audio = target.kind === "audiobook";
	return (
		<SheetHeader
			title={titleOrUntitled(target.title)}
			subtitle={target.subtitle ?? undefined}
			leading={
				<RNHostView matchContents>
					<Cover
						cover={target.cover}
						color={target.color}
						width={audio ? 56 : 44}
						shape={audio ? "audio" : "book"}
					/>
				</RNHostView>
			}
		/>
	);
}
