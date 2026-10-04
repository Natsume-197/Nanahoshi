import { expect, test } from "bun:test";
import { type BookMenuState, buildBookMenu } from "./model";

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
};
const base: BookMenuState = {
	inProgress: false,
	isPlaying: false,
	canDelete: false,
	canEditMetadata: false,
	download: null,
	canExport: false,
};
const titles = (sections: ReturnType<typeof buildBookMenu>) =>
	sections.map((section) => section.map((action) => action.label));

test("a book offers details and list actions, nothing to play", () => {
	expect(titles(buildBookMenu({ kind: "book" }, base, labels))).toEqual([
		["Details"],
		["Add to list", "Share link"],
	]);
});

test("an audiobook leads with play, which turns into pause while it plays", () => {
	const idle = buildBookMenu({ kind: "audiobook" }, base, labels);
	expect(idle[0].map((action) => action.label)).toEqual(["Listen", "Details"]);
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
		["Add to list", "Share link", "Remove from Continue listening"],
		["Not interested"],
		["Delete"],
	]);
	expect(sections[3][0].destructive).toBe(true);
});

test("the download action follows what's on the phone", () => {
	const library = (download: BookMenuState["download"]) =>
		buildBookMenu({ kind: "book" }, { ...base, download }, labels)[1].map(
			(action) => action.label,
		);
	expect(library("none")).toEqual(["Add to list", "Download", "Share link"]);
	expect(library("active")).toContain("Cancel download");
	expect(library("done")).toContain("Remove download");
	expect(library(null)).toEqual(["Add to list", "Share link"]);
});

test("exporting the file sits beside the offline download, gated on its own", () => {
	const library = buildBookMenu(
		{ kind: "audiobook" },
		{ ...base, download: null, canExport: true },
		labels,
	)[1].map((action) => action.label);
	// Can't keep it offline, may still take the file: the two are separate.
	expect(library).toEqual(["Add to list", "Export file…", "Share link"]);
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
	const library = (kind: "book" | "audiobook", canExport: boolean) =>
		buildBookMenu({ kind }, { ...base, canExport }, labels)[1].map(
			(action) => action.label,
		);
	expect(library("book", true)).toContain("Send to Kindle");
	expect(library("book", false)).not.toContain("Send to Kindle");
	expect(library("audiobook", true)).not.toContain("Send to Kindle");
});

test("metadata tools sit above delete, only for those who may edit", () => {
	const sections = (kind: "book" | "audiobook") =>
		titles(
			buildBookMenu(
				{ kind, onDetailPage: true },
				{ ...base, canEditMetadata: true, canDelete: true },
				labels,
			),
		);
	expect(sections("book").slice(-2)).toEqual([
		["Edit metadata", "Fix match", "Find metadata", "Restore original"],
		["Delete"],
	]);
	expect(sections("audiobook").at(-2)).toEqual([
		"Edit metadata",
		"Fix match",
		"Restore original",
	]);
	expect(
		titles(buildBookMenu({ kind: "book" }, base, labels)).flat(),
	).not.toContain("Edit metadata");
});
