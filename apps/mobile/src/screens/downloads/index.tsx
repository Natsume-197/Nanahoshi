import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { ChipRow } from "@/components/chip";
import { Cover } from "@/components/cover";
import { Icon, type IconName, icons } from "@/components/icon";
import { ProgressBar } from "@/components/progress-bar";
import { EmptyState } from "@/components/states";
import { Text } from "@/components/text";
import { freeSpace, type ListedDownload } from "@/downloads/files";
import {
	type DownloadJob,
	type DownloadReason,
	formatBytes,
} from "@/downloads/model";
import { useDownloadedTitles, useDownloads } from "@/downloads/provider";
import { daysUntilCleared, keepForever, smartOrigin } from "@/downloads/smart";
import { useDownloadActions } from "@/downloads/use-download-actions";
import { joinNames } from "@/lib/format";
import { locale, t } from "@/lib/i18n";
import { IS_ANDROID } from "@/lib/platform";
import { useMiniPlayerInset } from "@/player/mini-player";
import { usePlayer } from "@/player/provider";
import { space, usePalette } from "@/theme";

/** Everything on this phone for the active server: what opens without a
 * network, what's still arriving, and how much room it takes. */
export function DownloadsScreen() {
	const miniPlayerInset = useMiniPlayerInset();
	const { titles, jobs } = useDownloadedTitles();
	const [format, setFormat] = useState<"all" | "book" | "audiobook">("all");
	const used = titles.reduce((sum, title) => sum + title.bytes, 0);
	const shown =
		format === "all" ? titles : titles.filter((title) => title.kind === format);

	return (
		<FlatList
			data={shown}
			keyExtractor={(item) => `${item.kind}:${item.uuid}`}
			contentInsetAdjustmentBehavior="automatic"
			contentContainerStyle={{
				paddingVertical: space.sm,
				paddingBottom: space.sm + miniPlayerInset,
			}}
			ListHeaderComponent={
				titles.length > 0 ? (
					<View style={{ gap: space.md, paddingBottom: space.sm }}>
						<ChipRow
							value={format}
							onChange={setFormat}
							options={[
								{ value: "all", label: t("catalog_pages.all") },
								{ value: "book", label: t("nav.books") },
								{ value: "audiobook", label: t("nav.audiobooks") },
							]}
						/>
						<Text
							variant="caption"
							tone="secondary"
							style={{ paddingHorizontal: space.lg }}
						>
							{t("mobile.downloads.usage", {
								used: formatBytes(used, locale),
								free: formatBytes(freeSpace(), locale),
							})}
						</Text>
					</View>
				) : null
			}
			ListEmptyComponent={
				titles.length > 0 ? (
					// Only the filter is empty; there are downloads of the other kind.
					<EmptyState
						icon={icons.download}
						title={t(
							format === "audiobook"
								? "mobile.downloads.no_audiobooks"
								: "mobile.downloads.no_books",
						)}
					/>
				) : (
					<EmptyState
						icon={icons.download}
						title={t("mobile.downloads.empty_title")}
						message={t("mobile.downloads.empty_desc")}
					/>
				)
			}
			renderItem={({ item }) => (
				<DownloadRow item={item} job={jobs[item.uuid] ?? null} />
			)}
		/>
	);
}

function DownloadRow({
	item,
	job,
}: {
	item: ListedDownload;
	job: DownloadJob | null;
}) {
	const palette = usePalette();
	const player = usePlayer();
	const manager = useDownloads();
	const { start, cancel, remove } = useDownloadActions(
		item.kind,
		item.uuid,
		item.title,
	);
	const audio = item.kind === "audiobook";
	const active = job?.status === "queued" || job?.status === "downloading";
	const status =
		job?.status === "downloading"
			? t("mobile.downloads.downloading", {
					percent: Math.round(job.progress * 100),
				})
			: job?.status === "queued"
				? t("mobile.downloads.queued")
				: job?.status === "failed"
					? t("mobile.downloads.failed")
					: !item.complete
						? t("mobile.downloads.partial")
						: null;
	const detail = [
		audio ? t("mobile.downloads.audiobook") : t("mobile.downloads.book"),
		formatBytes(item.bytes, locale),
		joinNames(item.authors.map((name) => ({ name }))),
	]
		.filter(Boolean)
		.join(" · ");

	const origin = smartOrigin(item);
	const daysLeft = origin ? daysUntilCleared(item, Date.now()) : null;
	const smartLine = origin
		? [
				originLabel(origin, audio),
				daysLeft !== null
					? daysLeft === 0
						? t("mobile.smart.clears_today")
						: t("mobile.smart.clears_in", { count: daysLeft })
					: null,
			]
				.filter(Boolean)
				.join(" · ")
		: null;
	const keep = () =>
		manager.updateEntry(item.kind, item.serverId, item.uuid, {
			reasons: keepForever(item),
		});

	const open = () => {
		if (active) return;
		if (!item.complete || job?.status === "failed") return start();
		if (!audio)
			return router.push({
				pathname: "/reader/[uuid]",
				params: { uuid: item.uuid },
			});
		void player.play(item.uuid);
		router.push("/player");
	};

	return (
		<Pressable
			accessibilityRole="button"
			onPress={open}
			onLongPress={active ? cancel : remove}
			android_ripple={{ color: palette.ripple }}
			style={({ pressed }) => ({
				flexDirection: "row",
				alignItems: "center",
				gap: space.md,
				paddingHorizontal: space.lg,
				paddingVertical: space.sm,
				backgroundColor:
					pressed && !IS_ANDROID ? palette.surface : "transparent",
			})}
		>
			<Cover
				cover={item.cover}
				localUri={item.localCover}
				color={item.color}
				width={audio ? 56 : 44}
				shape={audio ? "audio" : "book"}
			/>
			<View style={{ flex: 1, gap: 4 }}>
				<Text variant="headline" numberOfLines={2}>
					{item.title}
				</Text>
				<Text
					variant="subhead"
					tone={job?.status === "failed" ? "danger" : "secondary"}
					numberOfLines={1}
				>
					{status ?? detail}
				</Text>
				{origin && smartLine && !status ? (
					<View
						style={{
							flexDirection: "row",
							alignItems: "center",
							gap: space.sm,
						}}
					>
						<Icon
							name={originIcon(origin, audio)}
							size={14}
							color={palette.textTertiary}
						/>
						<Text
							variant="caption"
							tone="tertiary"
							numberOfLines={1}
							style={{ flexShrink: 1 }}
						>
							{smartLine}
						</Text>
						{daysLeft !== null ? (
							<Pressable accessibilityRole="button" onPress={keep} hitSlop={8}>
								<Text variant="caption" style={{ fontWeight: "600" }}>
									{t("mobile.smart.keep")}
								</Text>
							</Pressable>
						) : null}
					</View>
				) : null}
				{job?.status === "downloading" ? (
					<ProgressBar value={job.progress * 100} />
				) : null}
			</View>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={
					active ? t("mobile.downloads.cancel") : t("mobile.downloads.remove")
				}
				onPress={active ? cancel : remove}
				hitSlop={8}
				android_ripple={{ color: palette.ripple, borderless: true, radius: 20 }}
				style={{
					width: 40,
					height: 40,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Icon
					name={active ? icons.remove : icons.trash}
					size={20}
					color={palette.textSecondary}
				/>
			</Pressable>
		</Pressable>
	);
}

function originIcon(origin: DownloadReason, audio: boolean): IconName {
	switch (origin.type) {
		case "collection":
			return icons.folder;
		case "series":
			return icons.series;
		case "reading":
			return audio ? icons.headphones : icons.book;
		default:
			return icons.bookmark;
	}
}

function originLabel(origin: DownloadReason, audio: boolean): string {
	switch (origin.type) {
		case "collection":
			return origin.name;
		case "series":
			return t("mobile.smart.origin_series");
		case "reading":
			return t(
				audio ? "mobile.smart.origin_listening" : "mobile.smart.origin_reading",
			);
		case "want":
			return t(
				audio
					? "mobile.smart.origin_want_listen"
					: "mobile.smart.origin_want_read",
			);
		default:
			return "";
	}
}
