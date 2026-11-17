import { Image } from "expo-image";

// Discord's "Clyde" mark (brand guidelines allow it on sign-in buttons).
const CLYDE = require("../../assets/images/discord-mark.svg");

export function DiscordMark({ size = 20 }: { size?: number }) {
	return (
		<Image
			source={CLYDE}
			contentFit="contain"
			accessible={false}
			style={{ width: size, height: size }}
		/>
	);
}
