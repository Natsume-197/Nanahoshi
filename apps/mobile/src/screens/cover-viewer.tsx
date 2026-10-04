import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
	useAnimatedStyle,
	useReducedMotion,
	useSharedValue,
	withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import { Icon, icons } from "@/components/icon";
import { coverUrl } from "@/lib/covers";
import { t } from "@/lib/i18n";
import { useConnection } from "@/providers/app-provider";

const MAX_ZOOM = 4;
const SETTLE = { duration: 400, dampingRatio: 1 };

/**
 * The cover on its own, Photos-style: pinch or double-tap to zoom, pan when
 * zoomed, drag down to let go (the backdrop fades with the drag).
 */
export function CoverViewer({
	cover,
	shape,
}: {
	cover: string;
	shape: "book" | "audio";
}) {
	const { serverUrl } = useConnection();
	const insets = useSafeAreaInsets();
	const { width, height } = useWindowDimensions();
	const reduceMotion = useReducedMotion();
	const aspect = shape === "audio" ? 1 : 1.5;
	const fitWidth = Math.min(
		width,
		(height - insets.top - insets.bottom) / aspect,
	);

	const scale = useSharedValue(1);
	const savedScale = useSharedValue(1);
	const x = useSharedValue(0);
	const y = useSharedValue(0);
	const savedX = useSharedValue(0);
	const savedY = useSharedValue(0);
	const dismiss = useSharedValue(0);

	const close = () => router.back();
	const reset = () => {
		"worklet";
		scale.set(withSpring(1, SETTLE));
		savedScale.set(1);
		x.set(withSpring(0, SETTLE));
		y.set(withSpring(0, SETTLE));
		savedX.set(0);
		savedY.set(0);
	};

	const pinch = Gesture.Pinch()
		.onUpdate((event) => {
			scale.set(
				Math.max(0.8, Math.min(MAX_ZOOM, savedScale.get() * event.scale)),
			);
		})
		.onEnd(() => {
			if (scale.get() <= 1) reset();
			else savedScale.set(scale.get());
		});

	const pan = Gesture.Pan()
		.averageTouches(true)
		.onUpdate((event) => {
			if (savedScale.get() > 1) {
				x.set(savedX.get() + event.translationX);
				y.set(savedY.get() + event.translationY);
			} else {
				dismiss.set(Math.max(0, event.translationY));
			}
		})
		.onEnd((event) => {
			if (savedScale.get() > 1) {
				savedX.set(x.get());
				savedY.set(y.get());
				return;
			}
			// A flick commits even when the drag was short.
			if (dismiss.get() + event.velocityY * 0.15 > 140) scheduleOnRN(close);
			else dismiss.set(withSpring(0, { ...SETTLE, velocity: event.velocityY }));
		});

	const doubleTap = Gesture.Tap()
		.numberOfTaps(2)
		.onEnd(() => {
			if (savedScale.get() > 1) reset();
			else {
				scale.set(withSpring(2.5, SETTLE));
				savedScale.set(2.5);
			}
		});

	const singleTap = Gesture.Tap()
		.requireExternalGestureToFail(doubleTap)
		.onEnd(() => {
			if (savedScale.get() <= 1) scheduleOnRN(close);
		});

	const gestures = Gesture.Exclusive(
		Gesture.Simultaneous(pinch, pan),
		doubleTap,
		singleTap,
	);

	const imageStyle = useAnimatedStyle(() => {
		const drag = dismiss.get();
		return {
			transform: [
				{ translateX: x.get() },
				{ translateY: y.get() + drag },
				{ scale: scale.get() * (1 - Math.min(drag / 1200, 0.25)) },
			],
		};
	});
	const backdropStyle = useAnimatedStyle(() => ({
		opacity: 1 - Math.min(dismiss.get() / 400, 0.9),
	}));

	return (
		<View style={{ flex: 1 }}>
			<Animated.View
				style={[
					{ position: "absolute", inset: 0, backgroundColor: "#000" },
					backdropStyle,
				]}
			/>
			<GestureDetector gesture={gestures}>
				<View
					style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
				>
					<Animated.View
						style={[
							{ width: fitWidth, height: fitWidth * aspect },
							reduceMotion ? undefined : imageStyle,
						]}
					>
						<Image
							source={{ uri: coverUrl(serverUrl, cover, 1600) ?? undefined }}
							placeholder={{
								uri: coverUrl(serverUrl, cover, 240) ?? undefined,
							}}
							contentFit="contain"
							transition={200}
							style={{ width: "100%", height: "100%" }}
							accessibilityIgnoresInvertColors
						/>
					</Animated.View>
				</View>
			</GestureDetector>
			<Pressable
				onPress={close}
				accessibilityRole="button"
				accessibilityLabel={t("common.close")}
				hitSlop={12}
				style={{
					position: "absolute",
					top: insets.top + 8,
					right: 16,
					width: 40,
					height: 40,
					borderRadius: 20,
					backgroundColor: "rgba(255,255,255,0.14)",
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Icon name={icons.dismiss} size={20} color="#fff" />
			</Pressable>
		</View>
	);
}
