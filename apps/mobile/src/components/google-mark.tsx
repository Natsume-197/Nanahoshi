import { Image } from "expo-image";

// Google's four-colour "G" (identity guidelines require the official mark).
const G = require("../../assets/images/google-mark.svg");

export function GoogleMark({ size = 20 }: { size?: number }) {
	return (
		<Image
			source={G}
			contentFit="contain"
			accessible={false}
			style={{ width: size, height: size }}
		/>
	);
}
