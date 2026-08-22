import { describe, expect, test } from "bun:test";

import { shouldAutoJoin } from "./invite-auto-join";

const PREVIEW = {
	status: "ok",
	alreadyMember: false,
	requiresDiscord: false,
	discordLinked: false,
};

describe("shouldAutoJoin", () => {
	test("joins when the OAuth callback asked for it and the visitor is signed in", () => {
		expect(
			shouldAutoJoin({ requested: true, hasSession: true, preview: PREVIEW }),
		).toBe(true);
	});

	test("stays manual for an organic visit without ?join", () => {
		expect(
			shouldAutoJoin({ requested: false, hasSession: true, preview: PREVIEW }),
		).toBe(false);
	});

	test("waits for a session (the callback may still be settling)", () => {
		expect(
			shouldAutoJoin({ requested: true, hasSession: false, preview: PREVIEW }),
		).toBe(false);
	});

	test("skips members and unusable links", () => {
		expect(
			shouldAutoJoin({
				requested: true,
				hasSession: true,
				preview: { ...PREVIEW, alreadyMember: true },
			}),
		).toBe(false);
		expect(
			shouldAutoJoin({
				requested: true,
				hasSession: true,
				preview: { ...PREVIEW, status: "expired" },
			}),
		).toBe(false);
		expect(
			shouldAutoJoin({ requested: true, hasSession: true, preview: null }),
		).toBe(false);
	});

	test("does not fire a join that the Discord gate would reject", () => {
		expect(
			shouldAutoJoin({
				requested: true,
				hasSession: true,
				preview: { ...PREVIEW, requiresDiscord: true, discordLinked: false },
			}),
		).toBe(false);
	});

	test("joins once Discord is linked", () => {
		expect(
			shouldAutoJoin({
				requested: true,
				hasSession: true,
				preview: { ...PREVIEW, requiresDiscord: true, discordLinked: true },
			}),
		).toBe(true);
	});
});
