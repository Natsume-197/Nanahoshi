import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { View } from "react-native";
import { Cover } from "@/components/cover";
import { Pressable } from "@/components/pressable";
import { Text } from "@/components/text";
import { useApi } from "@/providers/app-provider";
import { radius, shadows, space, usePalette } from "@/theme";

const FAN = [
	{ rotate: "-10deg", x: -46, y: 10 },
	{ rotate: "10deg", x: 46, y: 10 },
	{ rotate: "0deg", x: 0, y: 0 },
];
const WIDTH = 78;

/**
 * An empty shelf: three of the server's covers fanned out, one line and,
 * on your own profile, the way to the catalog. Offline (no covers cached)
 * the fan is plain plates.
 */
export function ProfileEmpty({
	audio,
	message,
	action,
}: {
	audio: boolean;
	message: string;
	action?: { label: string; format: "ebook" | "audiobook" } | null;
}) {
	const palette = usePalette();
	const { orpc } = useApi();
	const books = useQuery({
		...orpc.books.listRecent.queryOptions({
			input: { limit: 20, compact: true },
		}),
		enabled: !audio,
	});
	const audiobooks = useQuery({
		...orpc.audiobooks.listRecent.queryOptions({
			input: { limit: 20, compact: true },
		}),
		enabled: audio,
	});
	const recent = (audio ? audiobooks.data : books.data) ?? [];
	const covers = recent.filter((title) => title.cover).slice(0, 3);
	const shape = audio ? "audio" : "book";
	const height = audio ? WIDTH : Math.round(WIDTH * 1.42);

	return (
		<View
			style={{
				alignItems: "center",
				gap: space.lg,
				paddingTop: space.xl,
				paddingBottom: space.xxl,
				paddingHorizontal: space.xl,
			}}
		>
			<View style={{ width: WIDTH * 2.4, height: height + 24 }}>
				{FAN.map((slot, index) => {
					const title = covers[index];
					return (
						<View
							key={slot.rotate}
							style={{
								position: "absolute",
								left: WIDTH * 0.7,
								top: 6,
								transform: [
									{ translateX: slot.x },
									{ translateY: slot.y },
									{ rotate: slot.rotate },
								],
								borderRadius: palette.coverRadius,
								boxShadow: shadows.cover,
							}}
						>
							{title ? (
								<Cover
									cover={title.cover}
									color={title.mainColor}
									width={WIDTH}
									shape={shape}
								/>
							) : (
								<View
									style={{
										width: WIDTH,
										height,
										borderRadius: palette.coverRadius,
										backgroundColor: palette.surface,
										borderWidth: 1,
										borderColor: palette.separator,
									}}
								/>
							)}
						</View>
					);
				})}
			</View>
			<Text variant="headline" style={{ textAlign: "center" }}>
				{message}
			</Text>
			{action ? (
				<Pressable
					accessibilityRole="button"
					onPress={() =>
						router.push({
							pathname: "/catalog",
							params: { format: action.format },
						})
					}
					android_ripple={{ color: palette.ripple }}
					style={{
						height: 44,
						paddingHorizontal: space.xl,
						borderRadius: radius.pill,
						overflow: "hidden",
						justifyContent: "center",
						backgroundColor: palette.primary,
					}}
				>
					<Text variant="headline" style={{ color: palette.onPrimary }}>
						{action.label}
					</Text>
				</Pressable>
			) : null}
		</View>
	);
}
