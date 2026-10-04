import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { askChoice, showNotice } from "@/components/prompt";
import { type TitleDownloadState, useExports } from "@/downloads/provider";
import { useDownloadActions } from "@/downloads/use-download-actions";
import { useCan } from "@/lib/abilities";
import { titleOrUntitled } from "@/lib/format";
import { t } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { usePlayer, usePlayerState } from "@/player/provider";
import { useApi } from "@/providers/app-provider";
import type { MenuItem } from "../action-menu/types";
import { openAddToList } from "../add-to-list/open";
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
 * fetches like/progress for every cover.
 */
export function useBookMenu(target: BookTarget, fetch: boolean) {
	const { orpc } = useApi();
	const can = useCan();
	const audio = target.kind === "audiobook";
	const isPlaying = usePlayerState(
		(s) => s.book?.uuid === target.uuid && s.playing,
	);
	const input = { input: { bookUuid: target.uuid } };
	const like = useQuery({
		...orpc.likedBooks.getLikeStatus.queryOptions(input),
		enabled: fetch,
	});
	const listening = useQuery({
		...orpc.listeningProgress.getProgress.queryOptions(input),
		enabled: fetch && audio,
	});
	const reading = useQuery({
		...orpc.readingProgress.getProgress.queryOptions(input),
		enabled: fetch && !audio,
	});
	const download = useDownloadActions(
		audio ? "audiobook" : "book",
		target.uuid,
		target.title,
	);
	const state = {
		liked: like.data?.liked ?? false,
		inProgress: audio
			? listening.data?.status === "listening"
			: reading.data?.status === "reading",
		isPlaying,
		canLike: can("like", "create"),
		canDelete: can("book", "delete"),
		download: downloadMenuState(download.status.state, download.allowed),
		canExport: can(audio ? "audiobook" : "book", "download"),
	};
	const sections = buildBookMenu(target, state, {
		listen: t("audiobook.listen"),
		pause: t("audiobook.player_pause"),
		details: t("home.hero_view_details"),
		like: t("aria.add_to_likes"),
		unlike: t("aria.remove_from_likes"),
		addToList: t("add_to_list.title"),
		download: t("mobile.downloads.download"),
		cancelDownload: t("mobile.downloads.cancel"),
		removeDownload: t("mobile.downloads.remove"),
		exportFile: t("mobile.export.action"),
		removeContinueReading: t("book.remove_continue_reading"),
		removeContinueListening: t("book.remove_continue_listening"),
		notInterested: t("recs.not_interested"),
		delete: t("book.delete_permanently"),
	});
	const run = useBookMenuRunner(target, state.liked, download);
	const items: MenuItem[][] = sections.map((section) =>
		section.map((action) => ({ ...action, onPress: () => run(action) })),
	);
	return { items };
}

function useBookMenuRunner(
	target: BookTarget,
	liked: boolean,
	download: Pick<
		ReturnType<typeof useDownloadActions>,
		"start" | "cancel" | "remove"
	>,
) {
	const { orpc, client } = useApi();
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
		like: async () => {
			const key = orpc.likedBooks.getLikeStatus.queryKey({
				input: { bookUuid },
			});
			queryClient.setQueryData(key, { liked: !liked });
			try {
				await client.likedBooks.toggleLike({ bookUuid });
			} finally {
				void queryClient.invalidateQueries({
					queryKey: orpc.likedBooks.key(),
				});
			}
		},
		addToList: () =>
			openAddToList({ uuid: bookUuid, kind: audio ? "audiobook" : "ebook" }),
		download: download.start,
		cancelDownload: download.cancel,
		removeDownload: download.remove,
		exportFile: () =>
			exports.start(target.kind, bookUuid, titleOrUntitled(target.title)),
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
