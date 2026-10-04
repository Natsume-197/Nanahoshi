import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { Share } from "react-native";
import { askChoice, showNotice, showUndo } from "@/components/prompt";
import {
	type TitleDownloadState,
	useExports,
	useIsOnline,
} from "@/downloads/provider";
import { useDownloadActions } from "@/downloads/use-download-actions";
import { useCan } from "@/lib/abilities";
import { titleOrUntitled } from "@/lib/format";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { titleWebUrl } from "@/lib/web-links";
import { usePlayer, usePlayerState } from "@/player/provider";
import { useApi, useConnection } from "@/providers/app-provider";
import type { MenuEntry, MenuItem } from "../action-menu/types";
import { openAddToList } from "../add-to-list/open";
import { openFormSheet } from "../form-sheet/open";
import {
	type BookMenuAction,
	type BookMenuActionId,
	type BookMenuState,
	type BookTarget,
	buildBookMenu,
} from "./model";

/**
 * The actions for one title. `fetch` gates the network: menus that stay
 * mounted with their trigger (iOS) pass false and only read what's cached,
 * then flip to true while the menu is open, so a grid of tiles never
 * fetches progress for every cover.
 */
export function useBookMenu(target: BookTarget, fetch: boolean) {
	const { orpc } = useApi();
	const can = useCan();
	const audio = target.kind === "audiobook";
	const isPlaying = usePlayerState(
		(s) => s.book?.uuid === target.uuid && s.playing,
	);
	const input = { input: { bookUuid: target.uuid } };
	const listening = useQuery({
		...orpc.listeningProgress.getProgress.queryOptions(input),
		enabled: fetch && audio,
	});
	const reading = useQuery({
		...orpc.readingProgress.getProgress.queryOptions(input),
		enabled: fetch && !audio,
	});
	const online = useIsOnline();
	const download = useDownloadActions(
		audio ? "audiobook" : "book",
		target.uuid,
		target.title,
	);
	const state = {
		inProgress: audio
			? listening.data?.status === "listening"
			: reading.data?.status === "reading",
		isPlaying,
		canDelete: can("book", "delete"),
		canEditMetadata: can("book", "editMetadata"),
		download: downloadMenuState(download.status.state, download.allowed),
		canExport: online && can(audio ? "audiobook" : "book", "download"),
	};
	const sections = buildBookMenu(target, state, {
		listen: t("audiobook.listen"),
		pause: t("audiobook.player_pause"),
		details: t("home.hero_view_details"),
		addToList: t("add_to_list.title"),
		download: t("mobile.downloads.download"),
		cancelDownload: t("mobile.downloads.cancel"),
		removeDownload: t("mobile.downloads.remove"),
		exportFile: t("mobile.export.action"),
		sendToKindle: t("book.send_to_kindle"),
		shareLink: t("mobile.share.link"),
		removeContinueReading: t("book.remove_continue_reading"),
		removeContinueListening: t("book.remove_continue_listening"),
		notInterested: t("recs.not_interested"),
		editMetadata: t("book.edit_metadata"),
		fixMatch: t("match.action"),
		enrichMetadata: t("book.enrich_metadata"),
		restoreMetadata: t("book.restore_metadata"),
		delete: t("book.delete_permanently"),
		share: t("mobile.menu.share"),
		metadata: t("mobile.menu.metadata"),
	});
	const run = useBookMenuRunner(target, download);
	const toItem = (action: BookMenuAction): MenuItem => ({
		...action,
		onPress: () => run(action),
	});
	const items: MenuEntry[][] = sections.map((section) =>
		section.map((entry) =>
			"sections" in entry
				? { ...entry, sections: entry.sections.map((s) => s.map(toItem)) }
				: toItem(entry),
		),
	);
	return { items };
}

function useBookMenuRunner(
	target: BookTarget,
	download: Pick<
		ReturnType<typeof useDownloadActions>,
		"start" | "cancel" | "remove"
	>,
) {
	const { orpc, client } = useApi();
	const { serverUrl } = useConnection();
	const queryClient = useQueryClient();
	const player = usePlayer();
	const exports = useExports();
	const audio = target.kind === "audiobook";
	const bookUuid = target.uuid;

	const handlers: Record<BookMenuActionId, () => unknown> = {
		play: () =>
			player.getSnapshot().book?.uuid === bookUuid
				? player.toggle()
				: player.play(bookUuid),
		details: () => router.push(routes.title(target.kind, bookUuid)),
		addToList: () =>
			openAddToList({ uuid: bookUuid, kind: audio ? "audiobook" : "ebook" }),
		download: download.start,
		cancelDownload: download.cancel,
		removeDownload: download.remove,
		exportFile: () =>
			exports.start(target.kind, bookUuid, titleOrUntitled(target.title)),
		sendToKindle: () => openFormSheet({ form: "kindle", uuid: bookUuid }),
		shareLink: () => {
			const url = titleWebUrl(serverUrl, target.kind, bookUuid);
			const title = titleOrUntitled(target.title);
			// iOS shares `url` as a link; Android only reads `message`.
			return Share.share(
				process.env.EXPO_OS === "ios"
					? { url, title }
					: { message: url, title },
			);
		},
		removeFromContinue: async () => {
			if (audio)
				await client.listeningProgress.saveProgress({
					bookUuid,
					status: "unstarted",
				});
			else
				await client.readingProgress.saveProgress({
					bookUuid,
					status: "unread",
				});
			await queryClient.invalidateQueries({
				queryKey: audio
					? orpc.listeningProgress.key()
					: orpc.readingProgress.key(),
			});
		},
		notInterested: async () => {
			await client.recommendations.notInterested({ bookUuid });
			await queryClient.invalidateQueries({
				queryKey: orpc.recommendations.key(),
			});
			showUndo(t("recs.not_interested_toast"), () => {
				void client.recommendations
					.undoNotInterested({ bookUuid })
					.then(() =>
						queryClient.invalidateQueries({
							queryKey: orpc.recommendations.key(),
						}),
					)
					.catch(() => showNotice(t("mobile.error.action")));
			});
		},
		editMetadata: () =>
			router.push({
				pathname: "/edit-metadata/[uuid]",
				params: { uuid: bookUuid, kind: target.kind },
			}),
		fixMatch: () =>
			router.push({
				pathname: "/fix-match/[uuid]",
				params: { uuid: bookUuid, kind: target.kind },
			}),
		enrichMetadata: async () => {
			const result = await client.books
				.enrichFromAmazon({ uuid: bookUuid })
				.catch(() => null);
			if (!result) return showNotice(t("toast.metadata_fetch_failed"));
			if (!result.success) return showNotice(t("toast.metadata_none_found"));
			haptics.success();
			await queryClient.invalidateQueries();
		},
		restoreMetadata: async () => {
			const result = await (audio
				? client.audiobooks.restoreOriginalMetadata({ uuid: bookUuid })
				: client.books.restoreOriginalMetadata({ uuid: bookUuid })
			).catch(() => null);
			if (!result) return showNotice(t("toast.metadata_restore_failed"));
			if (!result.success) return showNotice(t("toast.metadata_none_original"));
			haptics.success();
			await queryClient.invalidateQueries();
		},
		delete: async () => {
			const answer = await askChoice({
				title: t("book.delete_confirm_title"),
				message: t("book.delete_confirm_description"),
				options: [
					{
						id: "delete",
						label: t("book.delete_confirm_action"),
						destructive: true,
					},
				],
			});
			if (answer !== "delete") return;
			await client.books
				.deletePermanently({ uuid: bookUuid })
				// A deleted title can be on any list; refetch what's showing.
				.then(() => queryClient.invalidateQueries())
				.catch(() => showNotice(t("toast.book_delete_permanently_failed")));
		},
	};

	return (action: BookMenuAction) => {
		void Promise.resolve(handlers[action.id]()).catch(() => undefined);
	};
}

function downloadMenuState(
	state: TitleDownloadState["state"],
	allowed: boolean,
): BookMenuState["download"] {
	if (state === "done") return "done";
	if (state === "queued" || state === "downloading") return "active";
	return allowed ? "none" : null;
}
