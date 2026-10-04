import { useQuery } from "@tanstack/react-query";
import type { Href } from "expo-router";
import type { ReactNode } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { Cover } from "@/components/cover";
import { Icon, type IconName, icons } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { PressableLink } from "@/components/pressable-link";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { useApi } from "@/providers/app-provider";
import { radius, space, usePalette } from "@/theme";

type Destination = { href: Href; label: () => string; icon: IconName };

/** Every browse destination of the web's LibraryHub, as one list, plus the
 * phone's own downloads. */
const BROWSE: Destination[] = [
	// First: offline, it's the one destination that still opens.
	{
		href: "/downloads",
		label: () => t("mobile.downloads.title"),
		icon: icons.downloaded,
	},
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
 * The Library tab, redesigned after Audible's "Lists from Library" and Apple
 * Music's library: a big title, the browse destinations as full-width rows
 * with a tinted icon tile and a chevron, then each library as a row with its
 * covers stacked. Rows, not tiles: they read as one list, scale to any count
 * and match the Collections tab.
 */
export function Library() {
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

	return (
		<ScrollView
			contentInsetAdjustmentBehavior={
				process.env.EXPO_OS === "ios" ? "never" : "automatic"
			}
			contentContainerStyle={{ paddingBottom: space.xxl }}
			refreshControl={
				<RefreshControl
					refreshing={libraries.isRefetching}
					onRefresh={() => libraries.refetch()}
				/>
			}
		>
			<PageHeader title={t("nav.library")} size="default" />

			<Section title={t("nav.browse")}>
				{destinations.map((item, index) => (
					<Row
						key={item.label()}
						href={item.href}
						first={index === 0}
						leading={<IconTile icon={item.icon} />}
						title={item.label()}
					/>
				))}
			</Section>

			<Section title={t("nav.libraries")}>
				{libraries.isPending ? (
					<View style={{ height: 80 }} />
				) : (libraries.data ?? []).length === 0 ? (
					<Text
						variant="subhead"
						tone="secondary"
						style={{ paddingHorizontal: space.lg, paddingVertical: space.lg }}
					>
						{t("library.none")}
					</Text>
				) : (
					(libraries.data ?? []).map((library, index) => {
						const audiobook = library.mediaType === "audiobook";
						const name = library.name ?? t("library.untitled");
						return (
							<Row
								key={library.uuid}
								href={{
									pathname: "/library/[uuid]",
									params: { uuid: library.uuid, name },
								}}
								first={index === 0}
								tall
								leading={
									<CoverStack
										covers={library.previewCovers}
										audiobook={audiobook}
									/>
								}
								title={name}
								subtitle={
									audiobook
										? t("media.audiobook_count", { count: library.bookCount })
										: t("media.book_count", { count: library.bookCount })
								}
							/>
						);
					})
				)}
			</Section>
		</ScrollView>
	);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<View style={{ paddingTop: space.xl }}>
			<Text
				variant="section"
				accessibilityRole="header"
				style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}
			>
				{title}
			</Text>
			{children}
		</View>
	);
}

/** Full-bleed list row: leading art, title (+ subtitle), chevron. The
 * hairline starts at the text so the art column reads as one strip. */
function Row({
	href,
	leading,
	title,
	subtitle,
	first,
	tall,
}: {
	href: Href;
	leading: ReactNode;
	title: string;
	subtitle?: string;
	first?: boolean;
	tall?: boolean;
}) {
	const palette = usePalette();
	return (
		<PressableLink
			android_ripple={{ color: palette.ripple }}
			href={href}
			accessibilityRole="button"
			accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.lg,
				paddingLeft: space.lg,
				backgroundColor:
					pressed && !IS_ANDROID ? palette.surfaceCardHover : "transparent",
			})}
		>
			{leading}
			<View
				style={{
					flex: 1,
					minHeight: tall ? 88 : 64,
					flexDirection: "row",
					alignItems: "center",
					gap: space.md,
					paddingRight: space.lg,
					borderTopWidth: first ? 0 : 1,
					borderColor: palette.separator,
				}}
			>
				<View style={{ flex: 1, gap: 2 }}>
					<Text variant="headline" numberOfLines={1}>
						{title}
					</Text>
					{subtitle ? (
						<Text
							variant="subhead"
							tone="secondary"
							style={{ fontVariant: ["tabular-nums"] }}
						>
							{subtitle}
						</Text>
					) : null}
				</View>
				<Icon
					name={icons.chevronRight}
					size={16}
					color={palette.textTertiary}
				/>
			</View>
		</PressableLink>
	);
}

/** Audible's list glyph: the icon on a soft accent-tinted square. */
function IconTile({ icon }: { icon: IconName }) {
	const palette = usePalette();
	return (
		<View
			style={{
				width: 44,
				height: 44,
				borderRadius: radius.field,
				borderCurve: "continuous",
				backgroundColor: palette.accentSoft,
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Icon name={icon} size={22} color={palette.accent} />
		</View>
	);
}

/** Up to three covers overlapping left to right, front one first. Fixed
 * 72×64 box so every library row aligns. */
function CoverStack({
	covers,
	audiobook,
}: {
	covers: string[];
	audiobook: boolean;
}) {
	const palette = usePalette();
	const unique = Array.from(new Set(covers.filter(Boolean))).slice(0, 3);
	if (unique.length === 0) {
		return (
			<View
				style={{
					width: 72,
					height: 64,
					borderRadius: radius.thumb,
					borderCurve: "continuous",
					backgroundColor: palette.surface,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Icon
					name={audiobook ? icons.headphones : icons.book}
					size={24}
					color={palette.textSecondary}
				/>
			</View>
		);
	}
	const height = 64;
	const width = audiobook ? height : Math.round(height / 1.5);
	const step = (72 - width) / 2;
	return (
		<View style={{ width: 72, height }}>
			{unique
				.map((cover, index) => (
					<View
						key={cover}
						style={{
							position: "absolute",
							left: index * step,
							top: index * 3,
							height: height - index * 6,
							opacity: 1 - index * 0.2,
							zIndex: 3 - index,
						}}
					>
						<Cover
							cover={cover}
							width={Math.round(width * (1 - index * 0.094))}
							shape={audiobook ? "audio" : "book"}
						/>
					</View>
				))
				.reverse()}
		</View>
	);
}
