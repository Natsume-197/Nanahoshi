import { Link } from "expo-router";
import type { ReactElement } from "react";
import { View } from "react-native";
import { routes } from "@/lib/routes";
import {
	type CollectionTarget,
	useCollectionMenu,
} from "./use-collection-menu";

export type { CollectionTarget } from "./model";
export { useCollectionMenu } from "./use-collection-menu";

/** A long-press UIContextMenu on the row: the system lift, blur and haptic. */
export function CollectionMenuTarget({
	collection,
	children,
}: {
	collection: CollectionTarget;
	children: (onLongPress: (() => void) | undefined) => ReactElement;
}) {
	const sections = useCollectionMenu(collection);
	if (sections.length === 0) return children(undefined);
	return (
		<Link href={routes.collection(collection.id)} asChild>
			<Link.Trigger>
				{/* One plain view for UIKit to lift; the row keeps its own press. */}
				<View collapsable={false}>{children(undefined)}</View>
			</Link.Trigger>
			<Link.Menu>
				{sections.map((section) => (
					<Link.Menu key={section[0].id} inline>
						{section.map((item) => (
							<Link.MenuAction
								key={item.id}
								icon={item.icon.ios}
								destructive={item.destructive}
								onPress={item.onPress}
							>
								{item.label}
							</Link.MenuAction>
						))}
					</Link.Menu>
				))}
			</Link.Menu>
		</Link>
	);
}
