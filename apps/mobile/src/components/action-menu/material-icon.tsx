import { Box, Icon } from "@expo/ui/jetpack-compose";
import { size as sizeModifier } from "@expo/ui/jetpack-compose/modifiers";
import { useQuery } from "@tanstack/react-query";
import {
	type AndroidSymbol,
	unstable_getMaterialSymbolSourceAsync,
} from "expo-symbols";
import type { IconName } from "../icon-names";

/** A Material Symbol for Compose's Icon, rasterized once per glyph and
 * tinted natively (the bitmap is white, so any tint applies cleanly). */
export function MaterialIcon({
	name,
	tint,
	size = 24,
}: {
	name: IconName;
	tint: string;
	size?: number;
}) {
	const source = useQuery({
		queryKey: ["material-symbol", name.android, size],
		queryFn: () =>
			unstable_getMaterialSymbolSourceAsync(
				name.android as AndroidSymbol,
				size,
				"#ffffff",
			),
		staleTime: Number.POSITIVE_INFINITY,
		gcTime: Number.POSITIVE_INFINITY,
		// Drawn on the device: offline must not park it.
		networkMode: "always",
	});
	if (!source.data) return <Box modifiers={[sizeModifier(size, size)]} />;
	return <Icon source={source.data} tint={tint} size={size} />;
}
