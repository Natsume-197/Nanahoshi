import { Stack } from "expo-router/stack";
import { usePalette } from "@/theme";

// Signed out, the welcome intro leads to enter; connect and sign-in follow it.
export const unstable_settings = { initialRouteName: "welcome" };

export default function AuthLayout() {
	const palette = usePalette();
	return (
		<Stack
			screenOptions={{
				// Each screen draws its own round back button, as the setup flows do.
				headerShown: false,
				contentStyle: { backgroundColor: palette.background },
			}}
		>
			<Stack.Screen name="welcome" options={{ animation: "fade" }} />
			<Stack.Screen name="enter" />
			<Stack.Screen name="sign-in" />
			<Stack.Screen name="connect" />
		</Stack>
	);
}
