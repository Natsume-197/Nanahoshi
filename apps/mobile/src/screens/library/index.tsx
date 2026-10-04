import { useQuery } from "@tanstack/react-query";
import { type Href, router, useScrollToTop } from "expo-router";
import { type ReactNode, useRef } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { Cover } from "@/components/cover";
import { Fab } from "@/components/fab";
import { Icon, type IconName, icons } from "@/components/icon";
import { LibraryMenuTarget } from "@/components/library-menu";
import { PageHeader } from "@/components/page-header";
import { PressableLink } from "@/components/pressable-link";
import { askChoice } from "@/components/prompt";
import { RefreshControl } from "@/components/refresh-control";
import { Section } from "@/components/section";
import { Bone, SkeletonPulse } from "@/components/skeleton";
import { Text } from "@/components/text";
import { useDownloadedTitles } from "@/downloads/provider";
import { useCan } from "@/lib/abilities";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { radius, sizes, space, usePalette } from "@/theme";

type Destination = { href: Href; label: () => string; icon: IconName };

/** Every browse destination of the web's LibraryHub. */
const BROWSE: Destination[] = [
	{ href: "/catalog", label: () => t("nav.catalog"), icon: icons.catalog },
	{ href: "/series", label: () => t("nav.series"), icon: icons.series },
	{ href: "/authors", label: () => t("nav.authors"), icon: icons.author },
	{ href: "/genres", label: () => t("nav.genres"), icon: icons.genre },
	{
		href: "/publishers",
		label: () => t("nav.publishers"),
		icon: icons.publisher,
	},
];
const NARRATORS: Destination = {
	href: "/narrators",
	label: () => t("nav.narrators"),
	icon: icons.narrator,
};

/**
 * The Library tab: the browse destinations as a compact two-column grid,
 * what's on the phone (only when there is some), then each library. Every
 * block is the same flat card, so the page reads as one surface.
 */
export function Library() {
	const miniPlayerInset = useMiniPlayerInset();
	const scrollRef = useRef<ScrollView>(null);
	useScrollToTop(scrollRef);
	const { orpc } = useApi();
	const narrators = useQuery({
		...orpc.narrators.count.queryOptions(),
		staleTime: 300_000,
	});
	const libraries = useQuery({
		...orpc.libraries.getLibrariesOverview.queryOptions(),
		staleTime: 30_000,
	});
	const destinations =
		(narrators.data ?? 0) > 0 ? [...BROWSE, NARRATORS] : BROWSE;
	const can = useCan();
	const canCreate = can("library", "create");
	const canUpload = can("library", "upload");

	return (
		<View style={{ flex: 1 }}>
			<ScrollView
				ref={scrollRef}
				contentInsetAdjustmentBehavior={
					process.env.EXPO_OS === "ios" ? "never" : "automatic"
				}
				contentContainerStyle={{
					// Room for the floating "+" under the last library.
					paddingBottom: space.xxl + miniPlayerInset + sizes.fab,
				}}
				refreshControl={
					<RefreshControl onRefresh={() => libraries.refetch()} />
				}
			>
				<PageHeader title={t("nav.library")} />

				<Section gap={GAP} style={SECTION_PADDING} title={t("nav.browse")}>
					<View style={{ flexDirection: "row", flexWrap: "wrap", gap: GAP }}>
						{destinations.map((item) => (
							<BrowseTile
								key={item.label()}
								href={item.href}
								icon={item.icon}
								label={item.label()}
							/>
						))}
					</View>
				</Section>

				<Section gap={GAP} style={SECTION_PADDING} title={t("nav.libraries")}>
					{libraries.isPending ? (
						<LibrariesSkeleton />
					) : (libraries.data ?? []).length === 0 ? (
						canCreate ? null : (
							<Text variant="subhead" tone="secondary">
								{t("library.none")}
							</Text>
						)
					) : (
						(libraries.data ?? []).map((library) => {
							const audio = library.mediaType === "audiobook";
							const name = library.name ?? t("library.untitled");
							return (
								<LibraryMenuTarget
									key={library.uuid}
									library={{
										uuid: library.uuid,
										name,
										mediaType: library.mediaType,
									}}
								>
									{(onLongPress) => (
										<CardRow
											href={{
												pathname: "/library/[uuid]",
												params: { uuid: library.uuid, name },
											}}
											onLongPress={onLongPress}
											title={name}
											subtitle={
												audio
													? t("media.audiobook_count", {
															count: library.bookCount,
														})
													: t("media.book_count", { count: library.bookCount })
											}
											art={
												<CoverFan
													fallback={audio ? icons.headphones : icons.book}
													covers={Array.from(
														new Set(library.previewCovers.filter(Boolean)),
													).map((cover) => ({ key: cover, cover, audio }))}
												/>
											}
										/>
									)}
								</LibraryMenuTarget>
							);
						})
					)}
					<DownloadsRow />
				</Section>
			</ScrollView>
			{canCreate || canUpload ? (
				<CreateFab canCreate={canCreate} canUpload={canUpload} />
			) : null}
		</View>
	);
}

const GAP = space.sm;
const SECTION_PADDING = { paddingTop: space.xl, paddingHorizontal: space.lg };
const ROW_HEIGHT = 88;
const FAN_HEIGHT = 64;
const FAN_WIDTH = 84;

/** Titles saved on this phone, as one more library: only when there are
 * some. */
function DownloadsRow() {
	const { titles } = useDownloadedTitles();
	if (titles.length === 0) return null;
	return (
		<CardRow
			href="/downloads"
			title={t("mobile.downloads.title")}
			subtitle={t("media.item_count", { count: titles.length })}
			art={
				<CoverFan
					fallback={icons.downloaded}
					covers={titles.map((title) => ({
						key: `${title.kind}:${title.uuid}`,
						cover: title.cover,
						localUri: title.localCover,
						color: title.color,
						audio: title.kind === "audiobook",
					}))}
				/>
			}
		/>
	);
}

/** The flat card every block on the page shares: covers, title, count. */
function CardRow({
	href,
	onLongPress,
	art,
	title,
	subtitle,
}: {
	href: Href;
	onLongPress?: () => void;
	art: ReactNode;
	title: string;
	subtitle: string;
}) {
	const palette = usePalette();
	return (
		<PressableLink
			href={href}
			onLongPress={onLongPress}
			android_ripple={{ color: palette.ripple }}
			accessibilityRole="button"
			accessibilityLabel={`${title}, ${subtitle}`}
			style={({ pressed }) => ({
				minHeight: ROW_HEIGHT,
				flexDirection: "row",
				alignItems: "center",
				gap: space.lg,
				paddingHorizontal: space.md,
				paddingVertical: space.md,
				borderRadius: radius.card,
				borderCurve: "continuous",
				overflow: "hidden",
				backgroundColor:
					pressed && !IS_ANDROID
						? palette.surfaceCardHover
						: palette.surfaceCard,
			})}
		>
			{art}
			<View style={{ flex: 1, gap: 2 }}>
				<Text variant="headline" numberOfLines={1}>
					{title}
				</Text>
				<Text
					variant="subhead"
					tone="secondary"
					style={{ fontVariant: ["tabular-nums"] }}
				>
					{subtitle}
				</Text>
			</View>
			<Icon name={icons.chevronRight} size={16} color={palette.textTertiary} />
		</PressableLink>
	);
}

type FanCover = {
	key: string;
	cover: string | null;
	localUri?: string | null;
	color?: string | null;
	audio: boolean;
};

/** Up to three covers overlapping left to right, the front one whole, in a
 * fixed box so every card's text lines up. */
function CoverFan({
	covers,
	fallback,
}: {
	covers: FanCover[];
	fallback: IconName;
}) {
	const palette = usePalette();
	const front = covers.slice(0, 3);
	if (front.length === 0) {
		return (
			<View
				style={{
					width: FAN_WIDTH,
					height: FAN_HEIGHT,
					borderRadius: radius.thumb,
					borderCurve: "continuous",
					backgroundColor: palette.surface,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Icon name={fallback} size={24} color={palette.textSecondary} />
			</View>
		);
	}
	return (
		<View style={{ width: FAN_WIDTH, height: FAN_HEIGHT }}>
			{front
				.map((item, index) => {
					const height = FAN_HEIGHT - index * 8;
					const width = item.audio ? height : Math.round(height / 1.5);
					return (
						<View
							key={item.key}
							style={{
								position: "absolute",
								left: index * 18,
								top: index * 4,
								opacity: 1 - index * 0.2,
							}}
						>
							<Cover
								cover={item.cover}
								localUri={item.localUri}
								color={item.color}
								width={width}
								shape={item.audio ? "audio" : "book"}
							/>
						</View>
					);
				})
				.reverse()}
		</View>
	);
}

/** Browse destination: icon and label on a flat tile, two per row. */
function BrowseTile({
	href,
	icon,
	label,
}: {
	href: Href;
	icon: IconName;
	label: string;
}) {
	const palette = usePalette();
	const screen = useWindowDimensions().width;
	return (
		<PressableLink
			href={href}
			android_ripple={{ color: palette.ripple }}
			accessibilityRole="button"
			accessibilityLabel={label}
			style={({ pressed }) => ({
				width: (screen - space.lg * 2 - GAP) / 2,
				height: 60,
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				paddingHorizontal: space.lg,
				borderRadius: radius.card,
				borderCurve: "continuous",
				overflow: "hidden",
				backgroundColor:
					pressed && !IS_ANDROID
						? palette.surfaceCardHover
						: palette.surfaceCard,
			})}
		>
			<Icon name={icon} size={22} color={palette.textSecondary} />
			<Text variant="headline" numberOfLines={1} style={{ flex: 1 }}>
				{label}
			</Text>
		</PressableLink>
	);
}

/**
 * Making and filling libraries, as Collections does it: one floating "+".
 * Both actions ask which; uploading only once some library can take files
 * (the web's create menu gates it the same way).
 */
function CreateFab({
	canCreate,
	canUpload,
}: {
	canCreate: boolean;
	canUpload: boolean;
}) {
	const { orpc } = useApi();
	const targets = useQuery({
		...orpc.libraries.getUploadTargets.queryOptions(),
		enabled: canUpload,
		staleTime: 30_000,
	});
	const showUpload = canUpload && (targets.data ?? []).length > 0;
	if (!canCreate && !showUpload) return null;
	const onPress = async () => {
		if (!canCreate) return router.push("/setup/upload");
		if (!showUpload) return router.push("/setup/library");
		const picked = await askChoice({
			title: t("nav.create"),
			options: [
				{ id: "library", label: t("library.new"), icon: icons.shelf },
				{ id: "upload", label: t("library.upload_books"), icon: icons.upload },
			],
		});
		if (picked === "library") router.push("/setup/library");
		else if (picked === "upload") router.push("/setup/upload");
	};
	return <Fab label={t("nav.create")} onPress={onPress} />;
}

/** Two library cards while the overview loads. */
function LibrariesSkeleton() {
	return (
		<SkeletonPulse>
			<View style={{ gap: GAP }}>
				<Bone width="100%" height={ROW_HEIGHT} radius={radius.card} />
				<Bone width="100%" height={ROW_HEIGHT} radius={radius.card} />
			</View>
		</SkeletonPulse>
	);
}
