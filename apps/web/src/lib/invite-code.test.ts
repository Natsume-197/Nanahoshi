import { expect, test } from "bun:test";
import { inviteCodeFrom } from "./invite-code";

test("finds the code in anything an invite looks like", () => {
	expect(inviteCodeFrom("https://books.example.com/invite/aB3xY9")).toBe(
		"aB3xY9",
	);
	expect(
		inviteCodeFrom("  https://books.example.com/invite/aB3xY9?join=1 "),
	).toBe("aB3xY9");
	expect(
		inviteCodeFrom(
			"nanahoshi://invite?server=https%3A%2F%2Fa.example&code=aB3xY9",
		),
	).toBe("aB3xY9");
	expect(inviteCodeFrom("aB3xY9")).toBe("aB3xY9");
});

test("says no to things that aren't invites", () => {
	expect(inviteCodeFrom("")).toBeNull();
	expect(inviteCodeFrom("https://books.example.com/dashboard")).toBeNull();
	expect(inviteCodeFrom("hello there")).toBeNull();
});
