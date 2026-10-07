import { useQuery } from "@tanstack/react-query";
import { type Href, useScrollToTop } from "expo-router";
import { useRef } from "react";
import { ScrollView, useWindowDimensions, View } from "react-native";
import { GroupedList, GroupedRow } from "@/components/grouped-list";
import { Icon, type IconName, icons } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { PressableLink } from "@/components/pressable-link";
import { Text } from "@/components/text";
import { t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { useMiniPlayerInset } from "@/player/mini-player";
import { useApi } from "@/providers/app-provider";
import { outline, space, usePalette } from "@/theme";

type Destination = { href: Href; label: () => string; icon: IconName };

/** The big four: where a reader actually goes from here. */
const PRIMARY: Destination[] = [
	{ href: "/catalog", label: () => t("nav.catalog"), icon: icons.catalog },
	{
		href: "/read-listen",
		label: () => t("nav.read_listen"),
		icon: icons.readListen,
	},
	{ href: "/series", label: () => t("nav.series"), icon: icons.series },
	{ href: "/authors", label: () => t("nav.authors"), icon: icons.author },
];

const NARRATORS = "/narrators";
const SECONDARY: Destination[] = [
	{ href: "/genres", label: () => t("nav.genres"), icon: icons.genre },
	{
		href: "/publishers",
		label: () => t("nav.publishers"),
		icon: icons.publisher,
	},
	{ href: NARRATORS, label: () => t("nav.narrators"), icon: icons.narrator },
	{ href: "/stats", label: () => t("nav.stats"), icon: icons.stats },
	{ href: "/libraries", label: () => t("nav.libraries"), icon: icons.shelf },
];

/**
 * The Library tab, as the web's LibraryHub draws it on a phone: four quick
 * destinations, then the rest of Browse as a list; the libraries themselves
 * have their own page, as genres and publishers do.
 */
export function Library() {
	const miniPlayerInset = useMiniPlayerInset();
	const scrollRef = useRef<ScrollView>(null);
	useScrollToTop(scrollRef);
	const { orpc } = useApi();
	// Narrators only exist for audiobooks; hide the row on servers without any.
	const narrators = useQuery({
		...orpc.narrators.count.queryOptions(),
		staleTime: 300_000,
	});
	const secondary = SECONDARY.filter(
		(item) => item.href !== NARRATORS || (narrators.data ?? 0) > 0,
	);
	return (
		<View style={{ flex: 1 }}>
			<ScrollView
				showsVerticalScrollIndicator={false}
				ref={scrollRef}
				contentInsetAdjustmentBehavior={
					process.env.EXPO_OS === "ios" ? "never" : "automatic"
				}
				contentContainerStyle={{
					paddingBottom: space.xxl + miniPlayerInset,
				}}
			>
				<PageHeader title={t("nav.library")} />

				<View
					style={{
						flexDirection: "row",
						flexWrap: "wrap",
						gap: space.sm,
						paddingHorizontal: space.lg,
						paddingTop: space.lg,
						paddingBottom: space.lg,
					}}
				>
					{PRIMARY.map((item) => (
						<QuickAction
							key={item.label()}
							href={item.href}
							icon={item.icon}
							label={item.label()}
						/>
					))}
				</View>
				<View>
					<GroupedList>
						{secondary.map((item, index) => (
							<GroupedRow
								key={item.label()}
								first={index === 0}
								icon={item.icon}
								label={item.label()}
								href={item.href}
							/>
						))}
					</GroupedList>
				</View>
			</ScrollView>
		</View>
	);
}

/** A primary destination: icon over label, two across. */
function QuickAction({
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
				width: (screen - space.lg * 2 - space.sm) / 2,
				minHeight: 88,
				justifyContent: "space-between",
				gap: space.md,
				padding: space.lg,
				...outline,
				borderColor: palette.separator,
				opacity: pressed && !IS_ANDROID ? 0.6 : 1,
			})}
		>
			<Icon name={icon} size={24} color={palette.text} />
			<Text variant="label" numberOfLines={1}>
				{label}
			</Text>
		</PressableLink>
	);
}
