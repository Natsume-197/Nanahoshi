import { describe, expect, test } from "bun:test";
import {
	TAB_AVATAR_VERSION,
	tabAvatarUrl,
	usableTabAvatar,
} from "./tab-avatar";

const url = "https://server/api/data/avatars/a.avif";

describe("tabAvatarUrl", () => {
	test("asks for the round PNG under a versioned key", () => {
		expect(tabAvatarUrl(url)).toBe(
			`${url}?format=png&shape=circle&v=${TAB_AVATAR_VERSION}`,
		);
		expect(tabAvatarUrl(`${url}?t=1`)).toBe(
			`${url}?t=1&format=png&shape=circle&v=${TAB_AVATAR_VERSION}`,
		);
	});

	test("no photo, no URL", () => {
		expect(tabAvatarUrl(null)).toBeNull();
	});
});

describe("usableTabAvatar", () => {
	const round = tabAvatarUrl(url);

	test("a server that sends the round PNG gets its photo in the tab", () => {
		expect(
			usableTabAvatar(round, {
				status: "answered",
				contentType: "image/png; charset=binary",
			}),
		).toBe(round);
	});

	test("a server that sends the plain square file keeps the glyph", () => {
		expect(
			usableTabAvatar(round, { status: "answered", contentType: "image/avif" }),
		).toBeNull();
		expect(
			usableTabAvatar(round, { status: "answered", contentType: null }),
		).toBeNull();
	});

	test("offline or still checking, the cached photo is used", () => {
		expect(usableTabAvatar(round, { status: "pending" })).toBe(round);
		expect(usableTabAvatar(round, { status: "failed" })).toBe(round);
	});
});
