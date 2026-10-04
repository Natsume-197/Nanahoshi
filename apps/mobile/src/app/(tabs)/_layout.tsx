import { useQuery } from "@tanstack/react-query";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { AddToListHost } from "@/components/add-to-list/host";
import { BookMenuProvider } from "@/components/book-menu";
import { ChoiceHost } from "@/components/prompt/host";
import {
	TAB_ICONS_UNTINTED,
	UNTINTED_TAB_ICONS,
	useAndroidTabIcons,
} from "@/components/tab-icons";
import { t } from "@/lib/i18n";
import { mediaUrl } from "@/lib/media";
import { HAS_TAB_ACCESSORY } from "@/lib/platform";
import { PlayerAccessory } from "@/player/mini-player";
import { usePlayerState } from "@/player/provider";
import { useApi, useConnection } from "@/providers/app-provider";
import { fonts, type, usePalette } from "@/theme";

/** Same five peers as the web's phone tab bar: Home · Search · Collections ·
 * Library · Me. Each tab keeps its own stack; re-tapping pops to its root. */
export default function TabsLayout() {
	const palette = usePalette();
	const { orpc } = useApi();
	const { serverUrl, auth } = useConnection();
	const active = auth.useActiveOrganization();
	const session = auth.useSession();
	const profile = useQuery(orpc.profile.getProfile.queryOptions());
	const playing = usePlayerState((s) => s.book !== null);
	const avatar = mediaUrl(
		serverUrl,
		profile.data?.image ?? session.data?.user.image,
	);
	// A round PNG from the server: native tab icons can't be clipped here.
	const avatarImage = avatar
		? `${avatar}${avatar.includes("?") ? "&" : "?"}format=png&shape=circle`
		: null;
	const drawn = useAndroidTabIcons([
		"home",
		"search",
		"collections_bookmark",
		"library_books",
		"account_circle",
	]);
	// Pre-colored glyphs when the bar won't tint them; the stock `md` otherwise.
	const md = (name: keyof typeof drawn) =>
		TAB_ICONS_UNTINTED ? { src: drawn[name] } : { md: name };
	// A tinted photo would be a flat disc, so Expo Go's Android bar keeps the glyph.
	const showAvatar =
		avatarImage && (process.env.EXPO_OS === "ios" || TAB_ICONS_UNTINTED);
	return (
		// Long-press any title, anywhere in the tabs, for its actions menu.
		<BookMenuProvider key={active.data?.id ?? "default"}>
			<NativeTabs
				{...(process.env.EXPO_OS === "ios"
					? // Scrolling tucks the bar away, and the player into it, as in Music.
						{ minimizeBehavior: "onScrollDown" as const }
					: {
							labelVisibilityMode: "labeled" as const,
							disableIndicator: true,
							backgroundColor: palette.chrome,
							tintColor: palette.text,
							// Icons arrive pre-colored (useAndroidTabIcons) so the
							// profile photo isn't flattened to a silhouette.
							iconColor: TAB_ICONS_UNTINTED
								? UNTINTED_TAB_ICONS
								: { default: palette.navInactive, selected: palette.text },
							labelStyle: {
								default: {
									color: palette.navInactive,
									fontSize: type.caption.fontSize,
									fontFamily: fonts["400"],
								},
								selected: {
									color: palette.text,
									fontSize: type.caption.fontSize,
									fontFamily: fonts["500"],
								},
							},
							rippleColor: palette.ripple,
						})}
			>
				{HAS_TAB_ACCESSORY && playing ? (
					<NativeTabs.BottomAccessory>
						<PlayerAccessory />
					</NativeTabs.BottomAccessory>
				) : null}
				<NativeTabs.Trigger name="(index)">
					<NativeTabs.Trigger.Icon
						sf={{ default: "house", selected: "house.fill" }}
						{...md("home")}
					/>
					<NativeTabs.Trigger.Label>{t("nav.home")}</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="(search)">
					<NativeTabs.Trigger.Icon sf="magnifyingglass" {...md("search")} />
					<NativeTabs.Trigger.Label>
						{t("common.search")}
					</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="(collections)">
					<NativeTabs.Trigger.Icon
						sf={{
							default: "rectangle.stack",
							selected: "rectangle.stack.fill",
						}}
						{...md("collections_bookmark")}
					/>
					<NativeTabs.Trigger.Label>
						{t("nav.collections")}
					</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="(library)">
					<NativeTabs.Trigger.Icon
						sf={{ default: "books.vertical", selected: "books.vertical.fill" }}
						{...md("library_books")}
					/>
					<NativeTabs.Trigger.Label>
						{t("nav.library")}
					</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
				<NativeTabs.Trigger name="(me)">
					{showAvatar ? (
						<NativeTabs.Trigger.Icon
							src={{
								default: { uri: avatarImage },
								selected: { uri: avatarImage },
							}}
							renderingMode="original"
						/>
					) : (
						<NativeTabs.Trigger.Icon
							sf={{
								default: "person.crop.circle",
								selected: "person.crop.circle.fill",
							}}
							{...md("account_circle")}
						/>
					)}
					<NativeTabs.Trigger.Label>{t("nav.me")}</NativeTabs.Trigger.Label>
				</NativeTabs.Trigger>
			</NativeTabs>
			<AddToListHost />
			<ChoiceHost />
		</BookMenuProvider>
	);
}
