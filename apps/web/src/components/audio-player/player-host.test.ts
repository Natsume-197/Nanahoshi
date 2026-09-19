import { expect, test } from "bun:test";
import {
	isPlayerHiddenRoute,
	shouldReserveReaderPlayerSpace,
} from "./player-route-visibility";

test("only an explicit Read & Listen session shows the player in the reader", () => {
	expect(isPlayerHiddenRoute("/reader/ebook-b")).toBe(true);
	expect(isPlayerHiddenRoute("/reader/ebook-b", true)).toBe(false);
	expect(isPlayerHiddenRoute("/dashboard/audiobooks")).toBe(false);
});

test("settings and authentication routes keep hiding the player", () => {
	expect(isPlayerHiddenRoute("/dashboard/settings/profile")).toBe(true);
	expect(isPlayerHiddenRoute("/dashboard/server/general")).toBe(true);
	expect(isPlayerHiddenRoute("/login")).toBe(true);
	expect(isPlayerHiddenRoute("/sign-up")).toBe(true);
});

test("an unrelated audiobook does not leave player space in a normal reader", () => {
	expect(shouldReserveReaderPlayerSpace(false, true)).toBe(false);
	expect(shouldReserveReaderPlayerSpace(true, true)).toBe(true);
	expect(shouldReserveReaderPlayerSpace(true, false)).toBe(false);
});
