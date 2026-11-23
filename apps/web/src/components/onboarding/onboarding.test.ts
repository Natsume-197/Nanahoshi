import { describe, expect, test } from "bun:test";
import {
	librariesFor,
	serverSlug,
	usernameFromEmail,
	welcomeStage,
} from "./onboarding";

describe("setup", () => {
	test("the server id comes from its name", () => {
		expect(serverSlug("  Biblioteca de Ñandú ")).toBe("biblioteca-de-nandu");
		expect(serverSlug("七星文庫", () => 0.5)).toMatch(/^server-\w+$/);
	});

	test("the username is suggested from the email", () => {
		expect(usernameFromEmail("Ana.Ruiz+books@example.com")).toBe(
			"ana.ruizbooks",
		);
		expect(usernameFromEmail("al@example.com")).toBe("");
		expect(usernameFromEmail("")).toBe("");
	});
});

describe("first library", () => {
	test("a folder becomes the libraries it holds", () => {
		expect(librariesFor({ ebooks: 312, audiobooks: 40 })).toEqual([
			"ebook",
			"audiobook",
		]);
		expect(librariesFor({ ebooks: 0, audiobooks: 5 })).toEqual(["audiobook"]);
	});

	test("an empty folder still gets a books library to upload into", () => {
		expect(librariesFor({ ebooks: 0, audiobooks: 0 })).toEqual(["ebook"]);
		expect(librariesFor(undefined)).toEqual(["ebook"]);
	});
});

describe("welcome stage", () => {
	const base = { libraryCount: 1, bookCount: 0, importing: false };

	test("asks for books until a library exists", () => {
		expect(welcomeStage({ ...base, libraryCount: 0 })).toBe("books");
	});

	test("follows the import, then celebrates or offers a way forward", () => {
		expect(welcomeStage({ ...base, importing: true })).toBe("importing");
		expect(welcomeStage({ ...base, bookCount: 312 })).toBe("ready");
		expect(welcomeStage(base)).toBe("empty");
	});
});
