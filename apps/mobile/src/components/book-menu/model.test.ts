import { expect, test } from "bun:test";
import { type BookMenuState, buildBookMenu } from "./model";

const labels = {
	listen: "Listen",
	pause: "Pause",
	details: "Details",
	like: "Like",
	unlike: "Unlike",
	addToList: "Add to list",
	download: "Download",
	cancelDownload: "Cancel download",
	removeDownload: "Remove download",
	exportFile: "Export file…",
	removeContinueReading: "Remove from Continue reading",
	removeContinueListening: "Remove from Continue listening",
	notInterested: "Not interested",
	delete: "Delete",
};
const base: BookMenuState = {
	liked: false,
	inProgress: false,
	isPlaying: false,
	canLike: true,
	canDelete: false,
	download: null,
	canExport: false,
};
const titles = (sections: ReturnType<typeof buildBookMenu>) =>
	sections.map((section) => section.map((action) => action.label));

test("a book offers details and list actions, nothing to play", () => {
	expect(titles(buildBookMenu({ kind: "book" }, base, labels))).toEqual([
		["Details"],
		["Like", "Add to list"],
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
		{ ...base, liked: true, inProgress: true, canDelete: true },
		labels,
	);
	expect(titles(sections)).toEqual([
		["Listen", "Details"],
		["Unlike", "Add to list", "Remove from Continue listening"],
		["Not interested"],
		["Delete"],
	]);
	expect(sections[3][0].destructive).toBe(true);
	expect(
		titles(
			buildBookMenu({ kind: "book" }, { ...base, canLike: false }, labels),
		)[1],
	).toEqual(["Add to list"]);
});

test("the download action follows what's on the phone", () => {
	const library = (download: BookMenuState["download"]) =>
		buildBookMenu({ kind: "book" }, { ...base, download }, labels)[1].map(
			(action) => action.label,
		);
	expect(library("none")).toEqual(["Like", "Add to list", "Download"]);
	expect(library("active")).toContain("Cancel download");
	expect(library("done")).toContain("Remove download");
	expect(library(null)).toEqual(["Like", "Add to list"]);
});

test("exporting the file sits beside the offline download, gated on its own", () => {
	const library = buildBookMenu(
		{ kind: "audiobook" },
		{ ...base, download: null, canExport: true },
		labels,
	)[1].map((action) => action.label);
	// Can't keep it offline, may still take the file: the two are separate.
	expect(library).toEqual(["Like", "Add to list", "Export file…"]);
});

test("on the title's own page the menu drops what the page's buttons do", () => {
	const sections = buildBookMenu(
		{ kind: "audiobook", onDetailPage: true },
		{ ...base, download: "none" },
		labels,
	);
	expect(titles(sections)).toEqual([["Like"]]);
});
