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
	| "like"
	| "addToList"
	| "download"
	| "cancelDownload"
	| "removeDownload"
	| "exportFile"
	| "removeFromContinue"
	| "notInterested"
	| "delete";

export type BookMenuAction = {
	id: BookMenuActionId;
	label: string;
	icon: IconName;
	destructive?: boolean;
};

export type BookMenuState = {
	liked: boolean;
	inProgress: boolean;
	isPlaying: boolean;
	canLike: boolean;
	canDelete: boolean;
	/** Where the title stands on this phone; null when it can't be downloaded. */
	download: "none" | "active" | "done" | null;
	/** The server's download permission: the real file, off the phone. */
	canExport: boolean;
};

type Labels = Record<
	| "listen"
	| "pause"
	| "details"
	| "like"
	| "unlike"
	| "addToList"
	| "download"
	| "cancelDownload"
	| "removeDownload"
	| "exportFile"
	| "removeContinueReading"
	| "removeContinueListening"
	| "notInterested"
	| "delete",
	string
>;

/** Sections become the platform's menu groups (UIMenu inline / dividers). */
export function buildBookMenu(
	target: Pick<BookTarget, "kind" | "recommendation" | "onDetailPage">,
	state: BookMenuState,
	labels: Labels,
): BookMenuAction[][] {
	const audio = target.kind === "audiobook";
	const page = !!target.onDetailPage;
	const open: BookMenuAction[] = [];
	if (audio && !page)
		open.push({
			id: "play",
			label: state.isPlaying ? labels.pause : labels.listen,
			icon: state.isPlaying ? icons.pause : icons.play,
		});
	if (!page)
		open.push({ id: "details", label: labels.details, icon: icons.info });

	const library: BookMenuAction[] = [];
	if (state.canLike)
		library.push({
			id: "like",
			label: state.liked ? labels.unlike : labels.like,
			icon: state.liked ? icons.heartFill : icons.heart,
		});
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
	if (state.canExport)
		library.push({
			id: "exportFile",
			label: labels.exportFile,
			icon: icons.share,
		});
	if (state.inProgress)
		library.push({
			id: "removeFromContinue",
			label: audio
				? labels.removeContinueListening
				: labels.removeContinueReading,
			icon: icons.remove,
		});

	const sections = [open, library].filter((section) => section.length > 0);
	if (target.recommendation)
		sections.push([
			{
				id: "notInterested",
				label: labels.notInterested,
				icon: icons.notInterested,
			},
		]);
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
