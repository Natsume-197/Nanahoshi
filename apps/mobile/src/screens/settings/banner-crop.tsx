import { Image } from "expo-image";
import { Modal, useWindowDimensions, View } from "react-native";
import {
	Gesture,
	GestureDetector,
	GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { Text } from "@/components/text";
import { type CropView, clampPan, cropRect } from "@/lib/crop";
import { t } from "@/lib/i18n";
import { radius, space, usePalette } from "@/theme";

export type PickedImage = { uri: string; width: number; height: number };
export type CropArea = ReturnType<typeof cropRect>;

const ASPECT = 4;
const MAX_ZOOM = 5;

/** Frames a picked photo into the 4:1 banner, as the web's editor does:
 * drag to move, pinch to zoom, the frame always stays covered. */
export function BannerCrop({
	image,
	busy,
	onCancel,
	onApply,
}: {
	image: PickedImage;
	busy: boolean;
	onCancel: () => void;
	onApply: (area: CropArea) => void;
}) {
	const palette = usePalette();
	const insets = useSafeAreaInsets();
	const { width: screenWidth } = useWindowDimensions();
	const frameWidth = screenWidth - space.lg * 2;
	const frameHeight = frameWidth / ASPECT;
	const cover = Math.max(frameWidth / image.width, frameHeight / image.height);

	const zoom = useSharedValue(1);
	const x = useSharedValue(0);
	const y = useSharedValue(0);
	const start = useSharedValue({ zoom: 1, x: 0, y: 0 });

	const frame = (next: { zoom: number; x: number; y: number }): CropView => {
		"worklet";
		return {
			imageWidth: image.width,
			imageHeight: image.height,
			frameWidth,
			frameHeight,
			...next,
		};
	};

	const pan = Gesture.Pan()
		.onStart(() => {
			start.value = { zoom: zoom.value, x: x.value, y: y.value };
		})
		.onUpdate((event) => {
			const next = clampPan(
				frame({
					zoom: zoom.value,
					x: start.value.x + event.translationX,
					y: start.value.y + event.translationY,
				}),
			);
			x.value = next.x;
			y.value = next.y;
		});
	const pinch = Gesture.Pinch()
		.onStart(() => {
			start.value = { zoom: zoom.value, x: x.value, y: y.value };
		})
		.onUpdate((event) => {
			const nextZoom = Math.min(
				MAX_ZOOM,
				Math.max(1, start.value.zoom * event.scale),
			);
			zoom.value = nextZoom;
			const next = clampPan(frame({ zoom: nextZoom, x: x.value, y: y.value }));
			x.value = next.x;
			y.value = next.y;
		});

	const imageStyle = useAnimatedStyle(() => ({
		transform: [
			{ translateX: x.value },
			{ translateY: y.value },
			{ scale: zoom.value },
		],
	}));

	return (
		<Modal
			visible
			animationType="slide"
			presentationStyle="fullScreen"
			onRequestClose={onCancel}
		>
			{/* A Modal is its own native root; gestures need their own host. */}
			<GestureHandlerRootView
				style={{
					flex: 1,
					backgroundColor: palette.background,
					paddingTop: insets.top + space.lg,
					paddingBottom: insets.bottom + space.lg,
					paddingHorizontal: space.lg,
					gap: space.lg,
				}}
			>
				<View style={{ gap: space.xs }}>
					<Text variant="title" accessibilityRole="header">
						{t("mobile.settings.banner_crop_title")}
					</Text>
					<Text variant="subhead" tone="secondary">
						{t("mobile.settings.banner_crop_hint")}
					</Text>
				</View>
				<View style={{ flex: 1, justifyContent: "center" }}>
					<GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
						<View
							style={{
								width: frameWidth,
								height: frameHeight,
								borderRadius: radius.card,
								borderCurve: "continuous",
								overflow: "hidden",
								alignItems: "center",
								justifyContent: "center",
								backgroundColor: palette.surfaceCard,
							}}
						>
							<Animated.View
								style={[
									{
										width: image.width * cover,
										height: image.height * cover,
									},
									imageStyle,
								]}
							>
								<Image
									source={{ uri: image.uri }}
									style={{ width: "100%", height: "100%" }}
									contentFit="fill"
								/>
							</Animated.View>
						</View>
					</GestureDetector>
				</View>
				<Button
					label={t("common.apply")}
					loading={busy}
					onPress={() =>
						onApply(
							cropRect(
								frame({
									zoom: zoom.value,
									x: x.value,
									y: y.value,
								}),
							),
						)
					}
				/>
				<Button
					variant="secondary"
					label={t("common.cancel")}
					disabled={busy}
					onPress={onCancel}
				/>
			</GestureHandlerRootView>
		</Modal>
	);
}
