import { describe, expect, test } from "bun:test";
import {
	parentPath,
	pathCrumbs,
	setupSteps,
	slugify,
	slugOrFallback,
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

	test("disappears once there are books", () => {
		expect(setupSteps({ ...base, titleCount: 3 })).toBeNull();
	});

	test("a member who can do neither sees no checklist", () => {
		expect(
			setupSteps({ ...base, canCreateLibrary: false, canUpload: false }),
		).toBeNull();
	});
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
