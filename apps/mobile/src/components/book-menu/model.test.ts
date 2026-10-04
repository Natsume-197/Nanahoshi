import { expect, test } from "bun:test";
import { type BookMenuEntry, type BookMenuState, buildBookMenu } from "./model";

const labels = {
	listen: "Listen",
	pause: "Pause",
	details: "Details",
	addToList: "Add to list",
	download: "Download",
	cancelDownload: "Cancel download",
	removeDownload: "Remove download",
	exportFile: "Export file…",
	sendToKindle: "Send to Kindle",
	shareLink: "Share link",
	removeContinueReading: "Remove from Continue reading",
	removeContinueListening: "Remove from Continue listening",
	notInterested: "Not interested",
	editMetadata: "Edit metadata",
	fixMatch: "Fix match",
	enrichMetadata: "Find metadata",
	restoreMetadata: "Restore original",
	delete: "Delete",
	share: "Share",
	metadata: "Metadata",
};
const base: BookMenuState = {
	inProgress: false,
	isPlaying: false,
	canDelete: false,
	canEditMetadata: false,
	download: null,
	canExport: false,
};
// A group reads as "Label ›" on the first page.
const label = (entry: BookMenuEntry) =>
	"sections" in entry ? `${entry.label} ›` : entry.label;
const titles = (sections: BookMenuEntry[][]) =>
	sections.map((section) => section.map(label));
const page = (sections: BookMenuEntry[][], id: string) => {
	const group = sections.flat().find((entry) => entry.id === id);
	return group && "sections" in group
		? group.sections.flat().map((action) => action.label)
		: null;
};

test("a book offers details and list actions, nothing to play", () => {
	expect(titles(buildBookMenu({ kind: "book" }, base, labels))).toEqual([
		["Details"],
		["Add to list"],
		["Share link"],
	]);
});

test("an audiobook leads with play, which turns into pause while it plays", () => {
	const idle = buildBookMenu({ kind: "audiobook" }, base, labels);
	expect(idle[0].map(label)).toEqual(["Listen", "Details"]);
	const playing = buildBookMenu(
		{ kind: "audiobook" },
		{ ...base, isPlaying: true },
		labels,
	);
	expect(playing[0][0].label).toBe("Pause");
});

test("state and permissions decide the optional actions", () => {
	const sections = buildBookMenu(
		{ kind: "audiobook", recommendation: true },
		{ ...base, inProgress: true, canDelete: true },
		labels,
	);
	expect(titles(sections)).toEqual([
		["Listen", "Details"],
		["Add to list", "Remove from Continue listening", "Not interested"],
		["Share link"],
		["Delete"],
	]);
	const remove = sections[3][0];
	expect("destructive" in remove && remove.destructive).toBe(true);
});

test("the download action follows what's on the phone", () => {
	const take = (download: BookMenuState["download"]) =>
		buildBookMenu({ kind: "book" }, { ...base, download }, labels)[2].map(
			label,
		);
	expect(take("none")).toEqual(["Download", "Share link"]);
	expect(take("active")).toContain("Cancel download");
	expect(take("done")).toContain("Remove download");
	expect(take(null)).toEqual(["Share link"]);
});

test("sharing folds into its own page once there's more than the link", () => {
	const sections = buildBookMenu(
		{ kind: "book" },
		{ ...base, download: "none", canExport: true },
		labels,
	);
	// Offline download stays on the first page; the file and Kindle go in Share.
	expect(sections[2].map(label)).toEqual(["Download", "Share ›"]);
	expect(page(sections, "share")).toEqual([
		"Share link",
		"Export file…",
		"Send to Kindle",
	]);
});

test("on the title's own page the menu drops what the page's buttons do", () => {
	const sections = buildBookMenu(
		{ kind: "audiobook", onDetailPage: true },
		{ ...base, download: "none" },
		labels,
	);
	expect(titles(sections)).toEqual([["Share link"]]);
});

test("only an ebook the user may download can go to a Kindle", () => {
	const shared = (kind: "book" | "audiobook", canExport: boolean) => {
		const sections = buildBookMenu({ kind }, { ...base, canExport }, labels);
		return page(sections, "share") ?? sections.flat().map(label);
	};
	expect(shared("book", true)).toContain("Send to Kindle");
	expect(shared("book", false)).not.toContain("Send to Kindle");
	expect(shared("audiobook", true)).not.toContain("Send to Kindle");
});

test("metadata tools get their own page above delete, only for editors", () => {
	const menu = (kind: "book" | "audiobook") =>
		buildBookMenu(
			{ kind, onDetailPage: true },
			{ ...base, canEditMetadata: true, canDelete: true },
			labels,
		);
	expect(titles(menu("book")).slice(-2)).toEqual([["Metadata ›"], ["Delete"]]);
	expect(page(menu("book"), "metadata")).toEqual([
		"Edit metadata",
		"Fix match",
		"Find metadata",
		"Restore original",
	]);
	expect(page(menu("audiobook"), "metadata")).toEqual([
		"Edit metadata",
		"Fix match",
		"Restore original",
	]);
	expect(
		titles(buildBookMenu({ kind: "book" }, base, labels)).flat(),
	).not.toContain("Metadata ›");
});
