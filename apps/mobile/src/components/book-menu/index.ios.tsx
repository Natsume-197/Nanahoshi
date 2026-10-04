import { Link } from "expo-router";
import type { ReactElement, ReactNode } from "react";
import {
	type StyleProp,
	useWindowDimensions,
	View,
	type ViewStyle,
} from "react-native";
import { routes } from "@/lib/routes";
import { isMenuGroup, type MenuItem } from "../action-menu/types";
import { Cover } from "../cover";
import type { BookTarget } from "./model";
import type { BookMenuTargetProps } from "./types";
import { useBookMenu } from "./use-book-menu";

export { BookMenuButton } from "./button";
export type { BookTarget } from "./model";

/** iOS menus belong to their trigger; nothing to host at the root. */
export function BookMenuProvider({ children }: { children: ReactNode }) {
	return children;
}

/**
 * A long-press UIContextMenu with the cover as its preview: the system lift,
 * blur and haptic, and tapping the preview opens the title.
 */
export function BookMenuTarget({
	target,
	style,
	children,
}: BookMenuTargetProps) {
	const { items } = useBookMenu(target, false);
	const previewSize = usePreviewSize(target);
	return (
		<Link href={routes.title(target.kind, target.uuid)} asChild>
			<Link.Trigger>
				<TriggerView style={style}>{children(undefined)}</TriggerView>
			</Link.Trigger>
			<Link.Preview style={previewSize}>
				<Preview target={target} width={previewSize.width} />
			</Link.Preview>
			<Link.Menu>
				{items.map((section) => (
					<Link.Menu key={section[0].id} inline>
						{section.map((entry) =>
							isMenuGroup(entry) ? (
								<Link.Menu
									key={entry.id}
									title={entry.label}
									icon={entry.icon.ios}
								>
									{entry.sections.flat().map(menuAction)}
								</Link.Menu>
							) : (
								menuAction(entry)
							),
						)}
					</Link.Menu>
				))}
			</Link.Menu>
		</Link>
	);
}

function menuAction(item: MenuItem) {
	return (
		<Link.MenuAction
			key={item.id}
			icon={item.icon.ios}
			destructive={item.destructive}
			onPress={item.onPress}
		>
			{item.label}
		</Link.MenuAction>
	);
}

/** Link's Slot hands the trigger its press props; the tile inside keeps its
 * own press handling, so this only gives UIKit a single view to lift. */
function TriggerView({
	style,
	children,
}: {
	style?: StyleProp<ViewStyle>;
	children: ReactElement;
}) {
	return (
		<View collapsable={false} style={style}>
			{children}
		</View>
	);
}

function usePreviewSize(target: BookTarget) {
	const { width } = useWindowDimensions();
	const audio = target.kind === "audiobook";
	const side = Math.min(width - 96, audio ? 300 : 240);
	return { width: side, height: audio ? side : Math.round(side * 1.5) };
}

/** Mounted only while the menu is up: its fetch fills the cache the
 * trigger's menu reads, and iOS refreshes the visible menu in place. */
function Preview({ target, width }: { target: BookTarget; width: number }) {
	useBookMenu(target, true);
	return (
		<Cover
			cover={target.cover}
			color={target.color}
			width={width}
			shape={target.kind === "audiobook" ? "audio" : "book"}
			rounded={0}
		/>
	);
}
