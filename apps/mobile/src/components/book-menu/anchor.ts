import type { View } from "react-native";
export type MenuAnchor = {
	x: number;
	y: number;
	width: number;
	height: number;
};
/** Measure the mounted view, not the expired event from Pressability's timer. */
export function measureMenuAnchor(
	source: Pick<View, "measureInWindow"> | null,
	onMeasure: (anchor: MenuAnchor) => void,
) {
	source?.measureInWindow((x, y, width, height) =>
		onMeasure({ x, y, width, height }),
	);
}
