import { Link } from "expo-router";
import type { ReactElement } from "react";
import { View } from "react-native";
import { isMenuGroup, type MenuItem } from "../action-menu/types";
import { type LibraryTarget, useLibraryMenu } from "./use-library-menu";

export type { LibraryTarget } from "./model";

/** A long-press UIContextMenu on the row: the system lift, blur and haptic. */
export function LibraryMenuTarget({
	library,
	children,
}: {
	library: LibraryTarget;
	children: (onLongPress: (() => void) | undefined) => ReactElement;
}) {
	const sections = useLibraryMenu(library);
	if (sections.length === 0) return children(undefined);
	return (
		<Link
			href={{
				pathname: "/library/[uuid]",
				params: { uuid: library.uuid, name: library.name },
			}}
			asChild
		>
			<Link.Trigger>
				{/* One plain view for UIKit to lift; the row keeps its own press. */}
				<View collapsable={false}>{children(undefined)}</View>
			</Link.Trigger>
			<Link.Menu>
				{sections.map((section) => (
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
