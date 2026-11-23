import { describe, expect, test } from "bun:test";
import {
	booksStage,
	isImporting,
	librariesFor,
	parentPath,
	pathCrumbs,
	setupSteps,
	slugify,
	slugOrFallback,
	usernameFromEmail,
} from "./setup-flow";

describe("server slug", () => {
	test("accents and spaces become a URL-safe id", () => {
		expect(slugify("  Biblioteca de Ñandú  ")).toBe("biblioteca-de-nandu");
	});

	test("a name with no Latin letters still gets an id", () => {
		expect(slugOrFallback("七星文庫", () => 0.5)).toMatch(/^server-\w+$/);
	});
});

describe("setup checklist", () => {
	const base = {
		canCreateLibrary: true,
		canUpload: true,
		libraryCount: 0,
		titleCount: 0,
		importing: false,
	};

	test("an empty server guides through library then upload", () => {
		expect(setupSteps(base)).toEqual([
			{ id: "library", done: false },
			{ id: "upload", done: false },
		]);
	});

	test("the library step ticks once one exists", () => {
		expect(setupSteps({ ...base, libraryCount: 1 })?.[0]?.done).toBe(true);
	});

	test("the upload step ticks while the first import runs", () => {
		expect(setupSteps({ ...base, libraryCount: 1, importing: true })).toEqual([
			{ id: "library", done: true },
			{ id: "upload", done: true },
		]);
	});

	test("disappears once there are books", () => {
		expect(setupSteps({ ...base, titleCount: 3 })).toBeNull();
	});

	test("a member who can do neither sees no checklist", () => {
		expect(
			setupSteps({ ...base, canCreateLibrary: false, canUpload: false }),
		).toBeNull();
	});
});

test("only a running scan or upload counts as importing", () => {
	expect(isImporting([{ type: "library-upload", status: "running" }])).toBe(
		true,
	);
	expect(isImporting([{ type: "library-scan", status: "completed" }])).toBe(
		false,
	);
	expect(isImporting([{ type: "metadata-enrich", status: "running" }])).toBe(
		false,
	);
	expect(isImporting(undefined)).toBe(false);
});

test("folder breadcrumbs walk up to the root", () => {
	expect(pathCrumbs("/books/novels").map((crumb) => crumb.path)).toEqual([
		"/",
		"/books",
		"/books/novels",
	]);
	expect(parentPath("/books/novels")).toBe("/books");
	expect(parentPath("/books")).toBe("/");
});

describe("first books", () => {
	test("a folder becomes the libraries it holds", () => {
		expect(librariesFor({ ebooks: 3, audiobooks: 2 })).toEqual([
			"ebook",
			"audiobook",
		]);
		expect(librariesFor({ ebooks: 0, audiobooks: 0 })).toEqual(["ebook"]);
	});

	test("the flow resumes from what the server has", () => {
		const base = { libraryCount: 1, bookCount: 0, importing: false };
		expect(booksStage({ ...base, libraryCount: 0 })).toBe("choose");
		expect(booksStage({ ...base, importing: true })).toBe("importing");
		expect(booksStage({ ...base, bookCount: 4 })).toBe("ready");
		expect(booksStage(base)).toBe("empty");
	});
});

test("the admin's username is suggested from the email", () => {
	expect(usernameFromEmail("Ana.Ruiz+books@example.com")).toBe("ana.ruizbooks");
	expect(usernameFromEmail("al@example.com")).toBe("");
});
