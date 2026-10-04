import { Redirect, router, useLocalSearchParams } from "expo-router";
import { type ReactNode, useState } from "react";
import { useColorScheme, useWindowDimensions, View } from "react-native";
import Animated, {
	FadeIn,
	FadeInDown,
	type SharedValue,
	useAnimatedRef,
	useAnimatedScrollHandler,
	useAnimatedStyle,
	useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CoverShelf } from "@/components/cover-shelf";
import { Text } from "@/components/text";
import { serverJustConnected } from "@/lib/auth-entry";
import { t } from "@/lib/i18n";
import { introSeen, markIntroSeen } from "@/lib/intro-seen";
import { welcomeCoverRows } from "@/lib/welcome-covers";
import {
	INTRO_SLIDES,
	LAST_SLIDE,
	skipIntro,
	slideAt,
} from "@/lib/welcome-intro";
import { EASE_OUT, radius, space } from "@/theme";
import { PaperButton } from "./entry-parts";
import { PaceMock, ReadListenMock } from "./intro-mockups";
import {
	FOOT_INSET,
	GUTTER,
	PAPER,
	type Paper,
	SECTION_GAP,
} from "./welcome-paper";

const [A = [], B = [], C = []] = welcomeCoverRows();
/** Five rows from the three: enough to fill the tilted wall corner to corner. */
const WALL_ROWS = [A, B, C, [...A].reverse(), [...B].reverse()];
const TILT = "-14deg";
const BAR_HEIGHT = 4;

/**
 * The first look at Nanahoshi, told in three flat slides (Fits' and
 * Bookmory's walk): a thin progress bar on top, the heading and one line,
 * the slide's picture, and one button. It asks for nothing; "Get started"
 * leads to the sign-in page, where it opens directly from then on.
 */
export function Welcome() {
	// `tour` asks for the story on purpose, from the sign-in page's back.
	const { tour } = useLocalSearchParams<{ tour?: string }>();
	const [skip] = useState(
		() =>
			tour !== "1" &&
			skipIntro({ seen: introSeen(), justConnected: serverJustConnected() }),
	);
	if (skip) return <Redirect href="/enter" />;
	return <Intro />;
}

function Intro() {
	const insets = useSafeAreaInsets();
	const { width } = useWindowDimensions();
	const paper = PAPER[useColorScheme() === "dark" ? "dark" : "light"];
	const pager = useAnimatedRef<Animated.ScrollView>();
	const scrollX = useSharedValue(0);
	const [slide, setSlide] = useState(0);
	const onScroll = useAnimatedScrollHandler((event) => {
		scrollX.value = event.contentOffset.x;
	});
	const mockWidth = Math.min(320, width - GUTTER * 2);
	const last = slide === LAST_SLIDE;
	const toEnter = () => {
		markIntroSeen();
		router.push("/enter");
	};
	const advance = () => {
		if (last) {
			toEnter();
			return;
		}
		pager.current?.scrollTo({ x: (slide + 1) * width, animated: true });
		setSlide(slide + 1);
	};
	const top = insets.top + space.md + BAR_HEIGHT + space.xl;

	return (
		<View style={{ flex: 1, backgroundColor: paper.paper }}>
			<Animated.ScrollView
				ref={pager}
				horizontal
				pagingEnabled
				bounces={false}
				overScrollMode="never"
				showsHorizontalScrollIndicator={false}
				onScroll={onScroll}
				scrollEventThrottle={16}
				onMomentumScrollEnd={(event) =>
					setSlide(slideAt(event.nativeEvent.contentOffset.x, width))
				}
			>
				<Slide
					width={width}
					top={top}
					paper={paper}
					title={t("mobile.welcome.title")}
					lead={t("mobile.welcome.lead")}
				>
					<CoverWall />
				</Slide>
				<Slide
					width={width}
					top={top}
					paper={paper}
					title={t("mobile.intro.listen_title")}
					lead={t("mobile.intro.listen_lead")}
				>
					<Centered>
						<ReadListenMock paper={paper} width={mockWidth} />
					</Centered>
				</Slide>
				<Slide
					width={width}
					top={top}
					paper={paper}
					title={t("mobile.intro.pace_title")}
					lead={t("mobile.intro.pace_lead")}
				>
					<Centered>
						<PaceMock paper={paper} width={mockWidth} />
					</Centered>
				</Slide>
			</Animated.ScrollView>

			<View
				pointerEvents="none"
				style={{
					position: "absolute",
					top: insets.top + space.md,
					left: GUTTER,
					right: GUTTER,
				}}
			>
				<StepBar
					count={INTRO_SLIDES}
					scrollX={scrollX}
					width={width}
					paper={paper}
				/>
			</View>

			<Animated.View
				entering={rise(2)}
				style={{
					paddingHorizontal: GUTTER,
					paddingBottom: insets.bottom + FOOT_INSET - space.sm,
					gap: space.xs,
				}}
			>
				<PaperButton
					filled
					paper={paper}
					label={last ? t("mobile.intro.start") : t("mobile.intro.next")}
					onPress={advance}
				/>
				{/* The way in is never more than a tap away, on any slide. */}
				<PaperButton
					plain
					paper={paper}
					label={t("mobile.intro.sign_in")}
					onPress={toEnter}
				/>
			</Animated.View>
		</View>
	);
}

/** One slide: heading and line on the left edge, its picture below. */
function Slide({
	width,
	top,
	paper,
	title,
	lead,
	children,
}: {
	width: number;
	top: number;
	paper: Paper;
	title: string;
	lead: string;
	children: ReactNode;
}) {
	return (
		<View style={{ width, flex: 1, paddingTop: top, gap: SECTION_GAP }}>
			<View style={{ gap: space.md, paddingHorizontal: GUTTER }}>
				<Animated.View entering={rise(0)}>
					<Text
						variant="display"
						accessibilityRole="header"
						// One line always: narrow phones shrink it rather than wrap.
						numberOfLines={1}
						adjustsFontSizeToFit
						minimumFontScale={0.8}
						style={{
							color: paper.ink,
							fontSize: 28,
							lineHeight: 33,
							letterSpacing: -0.5,
						}}
					>
						{title}
					</Text>
				</Animated.View>
				<Animated.View entering={rise(1)}>
					<Text
						variant="body"
						style={{
							color: paper.inkSoft,
							fontSize: 16,
							lineHeight: 23,
							maxWidth: 320,
						}}
					>
						{lead}
					</Text>
				</Animated.View>
			</View>
			<View style={{ flex: 1, marginBottom: SECTION_GAP }}>{children}</View>
		</View>
	);
}

/** The first slide's picture: covers tilted and drifting, edge to edge. */
function CoverWall() {
	const { width, height } = useWindowDimensions();
	const coverHeight = Math.round(Math.min(140, height * 0.14));
	return (
		<View style={{ flex: 1, overflow: "hidden" }}>
			{/* Wider than the screen so the tilt never shows a corner. */}
			<Animated.View
				entering={FadeIn.duration(900)}
				style={{
					position: "absolute",
					top: -coverHeight * 0.9,
					left: -width * 0.35,
					width: width * 1.7,
					transform: [{ rotate: TILT }],
				}}
			>
				<CoverShelf rows={WALL_ROWS} coverHeight={coverHeight} />
			</Animated.View>
		</View>
	);
}

function Centered({ children }: { children: ReactNode }) {
	return (
		<View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
			{children}
		</View>
	);
}

/** Fits' thin bar: one segment per slide, filling as you swipe. */
function StepBar({
	count,
	scrollX,
	width,
	paper,
}: {
	count: number;
	scrollX: SharedValue<number>;
	width: number;
	paper: Paper;
}) {
	return (
		<View style={{ flexDirection: "row", gap: space.xs }}>
			{Array.from({ length: count }, (_, index) => (
				<Segment
					// biome-ignore lint/suspicious/noArrayIndexKey: fixed slides
					key={index}
					index={index}
					scrollX={scrollX}
					width={width}
					paper={paper}
				/>
			))}
		</View>
	);
}

function Segment({
	index,
	scrollX,
	width,
	paper,
}: {
	index: number;
	scrollX: SharedValue<number>;
	width: number;
	paper: Paper;
}) {
	const fill = useAnimatedStyle(() => {
		const reached = Math.min(1, Math.max(0, scrollX.value / width - index + 1));
		return { width: `${reached * 100}%` };
	});
	return (
		<View
			style={{
				flex: 1,
				height: BAR_HEIGHT,
				borderRadius: radius.pill,
				overflow: "hidden",
				backgroundColor: paper.mockLine,
			}}
		>
			<Animated.View
				style={[{ height: BAR_HEIGHT, backgroundColor: paper.ink }, fill]}
			/>
		</View>
	);
}

/** Heading, line, then the button arrive one after another. */
export const rise = (step: number) =>
	FadeInDown.duration(280)
		.delay(200 + step * 50)
		.easing(EASE_OUT);
