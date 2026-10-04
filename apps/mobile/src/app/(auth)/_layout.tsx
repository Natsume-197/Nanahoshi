import { Stack } from "expo-router/stack";
import { usePalette } from "@/theme";

export default function AuthLayout() {
	const palette = usePalette();
	return (
		<Stack
			screenOptions={{
				headerShadowVisible: false,
				headerTitle: "",
				headerBackButtonDisplayMode: "minimal",
				headerStyle: { backgroundColor: palette.background },
				contentStyle: { backgroundColor: palette.background },
			}}
		>
			<Stack.Screen name="sign-in" />
			<Stack.Screen name="connect" />
		</Stack>
	);
}
