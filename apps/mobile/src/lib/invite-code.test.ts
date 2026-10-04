import { expect, test } from "bun:test";
import { parseInviteCode } from "./invite-code";

test("a pasted invite link or a bare code both give the code", () => {
	expect(parseInviteCode("https://books.example/invite/aB3xY9?join=1")).toBe(
		"aB3xY9",
	);
	expect(parseInviteCode("http://192.168.1.7:3000/invite/aB3xY9/")).toBe(
		"aB3xY9",
	);
	expect(parseInviteCode("  aB3xY9 ")).toBe("aB3xY9");
});

test("text that can't be a code is refused before asking the server", () => {
	expect(parseInviteCode("")).toBeNull();
	expect(parseInviteCode("https://books.example/dashboard")).toBeNull();
	expect(parseInviteCode("not a code")).toBeNull();
});
