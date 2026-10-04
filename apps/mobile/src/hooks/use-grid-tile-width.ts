import { useWindowDimensions } from "react-native";
import { space } from "@/theme";

/** Width of one tile in an N-column grid with the standard 16pt gutters. */
export function useGridTileWidth(columns: number, gap: number) {
	const { width } = useWindowDimensions();
	return Math.floor((width - space.lg * 2 - gap * (columns - 1)) / columns);
}
