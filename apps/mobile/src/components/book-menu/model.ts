import type { MediaKind } from "@/lib/routes";
import { type IconName, icons } from "../icon-names";

export type BookTarget = {
	uuid: string;
	kind: MediaKind;
	title: string | null;
	cover: string | null;
	color?: string | null;
	subtitle?: string | null;
	/** Opened from a recommendation: offers "Not interested". */
	recommendation?: boolean;
	/** The title's own page, whose buttons already play, open, list and
	 * download it. */
	onDetailPage?: boolean;
};

export type BookMenuActionId =
	| "play"
	| "details"
	| "addToList"
	| "download"
	| "cancelDownload"
	| "removeDownload"
	| "exportFile"
	| "sendToKindle"
	| "shareLink"
	| "removeFromContinue"
	| "notInterested"
	| "editMetadata"
	| "fixMatch"
	| "enrichMetadata"
	| "restoreMetadata"
	| "delete";

export type BookMenuAction = {
	id: BookMenuActionId;
	label: string;
	icon: IconName;
	destructive?: boolean;
};

/** A row that opens its own page in the sheet. */
export type BookMenuGroup = {
	id: "share" | "metadata";
	label: string;
	icon: IconName;
	sections: BookMenuAction[][];
};

export type BookMenuEntry = BookMenuAction | BookMenuGroup;

export type BookMenuState = {
	inProgress: boolean;
	isPlaying: boolean;
	canDelete: boolean;
	canEditMetadata: boolean;
	/** Where the title stands on this phone; null when it can't be downloaded. */
	download: "none" | "active" | "done" | null;
	/** The server's download permission: the real file, off the phone. */
	canExport: boolean;
};

type Labels = Record<
	| "listen"
	| "pause"
	| "details"
	| "addToList"
	| "download"
	| "cancelDownload"
	| "removeDownload"
	| "exportFile"
	| "sendToKindle"
	| "shareLink"
	| "removeContinueReading"
	| "removeContinueListening"
	| "notInterested"
	| "editMetadata"
	| "fixMatch"
	| "enrichMetadata"
	| "restoreMetadata"
	| "delete"
	| "share"
	| "metadata",
	string
>;

/** A page of one action is just that action: no point tapping into it. */
function group(
	id: BookMenuGroup["id"],
	label: string,
	icon: IconName,
	actions: BookMenuAction[],
): BookMenuEntry[] {
	if (actions.length <= 1) return actions;
	return [{ id, label, icon, sections: [actions] }];
}

/**
 * Sections become the platform's menu groups (UIMenu inline / dividers).
 * Sharing and the metadata tools fold into pages of their own so the first
 * page stays short.
 */
export function buildBookMenu(
	target: Pick<BookTarget, "kind" | "recommendation" | "onDetailPage">,
	state: BookMenuState,
	labels: Labels,
): BookMenuEntry[][] {
	const audio = target.kind === "audiobook";
	const page = !!target.onDetailPage;
	const open: BookMenuEntry[] = [];
	if (audio && !page)
		open.push({
			id: "play",
			label: state.isPlaying ? labels.pause : labels.listen,
			icon: state.isPlaying ? icons.pause : icons.play,
		});
	if (!page)
		open.push({ id: "details", label: labels.details, icon: icons.info });

	const library: BookMenuEntry[] = [];
	if (!page)
		library.push({
			id: "addToList",
			label: labels.addToList,
			icon: icons.bookmark,
		});
	// The page's header has its own download button.
	if (!page) {
		if (state.download === "none")
			library.push({
				id: "download",
				label: labels.download,
				icon: icons.download,
			});
		else if (state.download === "active")
			library.push({
				id: "cancelDownload",
				label: labels.cancelDownload,
				icon: icons.remove,
			});
		else if (state.download === "done")
			library.push({
				id: "removeDownload",
				label: labels.removeDownload,
				icon: icons.downloaded,
			});
	}
	const share: BookMenuAction[] = [
		{ id: "shareLink", label: labels.shareLink, icon: icons.link },
	];
	if (state.canExport)
		share.push({
			id: "exportFile",
			label: labels.exportFile,
			icon: icons.share,
		});
	// The server mails the file itself, so it's gated like a download.
	if (state.canExport && !audio)
		share.push({
			id: "sendToKindle",
			label: labels.sendToKindle,
			icon: icons.send,
		});
	library.push(...group("share", labels.share, icons.share, share));
	if (state.inProgress)
		library.push({
			id: "removeFromContinue",
			label: audio
				? labels.removeContinueListening
				: labels.removeContinueReading,
			icon: icons.remove,
		});
	if (target.recommendation)
		library.push({
			id: "notInterested",
			label: labels.notInterested,
			icon: icons.notInterested,
		});

	const sections = [open, library].filter((section) => section.length > 0);
	if (state.canEditMetadata)
		sections.push(
			group("metadata", labels.metadata, icons.edit, [
				{ id: "editMetadata", label: labels.editMetadata, icon: icons.edit },
				{ id: "fixMatch", label: labels.fixMatch, icon: icons.search },
				// Audiobooks refresh through their match; ebooks can ask the sources.
				...(audio
					? []
					: [
							{
								id: "enrichMetadata" as const,
								label: labels.enrichMetadata,
								icon: icons.whatsNew,
							},
						]),
				{
					id: "restoreMetadata",
					label: labels.restoreMetadata,
					icon: icons.retry,
				},
			]),
		);
	if (state.canDelete)
		sections.push([
			{
				id: "delete",
				label: labels.delete,
				icon: icons.trash,
				destructive: true,
			},
		]);
	return sections;
}
