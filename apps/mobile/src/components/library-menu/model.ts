export type LibraryTarget = {
	uuid: string;
	name: string;
	mediaType: "book" | "audiobook" | string | null;
};

export type LibraryAction =
	| "upload"
	| "scanNow"
	| "fullScan"
	| "reprocess"
	| "tasks"
	| "delete";

/** One section of the menu; `scan` is the page of scan actions. */
export type LibraryMenuEntry =
	| LibraryAction
	| { group: "scan"; actions: LibraryAction[] };

/** What a library offers on long-press, by permission. Uploads are ebook
 * files only, so audiobook libraries never offer them. */
export function libraryActions(
	library: Pick<LibraryTarget, "mediaType">,
	can: (resource: string, action: string) => boolean,
): LibraryMenuEntry[][] {
	const manage: LibraryMenuEntry[] = [];
	if (library.mediaType !== "audiobook" && can("library", "upload"))
		manage.push("upload");
	if (can("library", "scan"))
		manage.push({
			group: "scan",
			actions: ["scanNow", "fullScan", "reprocess", "tasks"],
		});
	const danger: LibraryMenuEntry[] = can("library", "delete") ? ["delete"] : [];
	return [manage, danger].filter((section) => section.length > 0);
}
