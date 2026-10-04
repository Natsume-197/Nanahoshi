import { expect, mock, test } from "bun:test";

mock.module("expo-secure-store", () => ({
	getItem: () => null,
	setItemAsync: async () => {},
	deleteItemAsync: async () => {},
}));
const { inviteHref, parseInviteLink } = await import("./invite-link");

test("reads a deep link from the web invite page", () => {
	expect(
		parseInviteLink({
			server: "https://books.example/",
			code: "aB3xY9",
			link: "https://books.example/invite/aB3xY9",
		}),
	).toEqual({
		server: "https://books.example",
		code: "aB3xY9",
		link: "https://books.example/invite/aB3xY9",
	});
});

test("falls back to the server's own invite page", () => {
	expect(
		parseInviteLink({ server: "192.168.1.7:3000", code: "abc" })?.link,
	).toBe("http://192.168.1.7:3000/invite/abc");
});

test("rejects links it can't act on", () => {
	expect(parseInviteLink({ server: "https://books.example" })).toBeNull();
	expect(parseInviteLink({ code: "abc" })).toBeNull();
	expect(
		parseInviteLink({ server: "https://books.example", code: "../x" }),
	).toBeNull();
	expect(
		parseInviteLink({
			server: "https://books.example",
			code: "abc",
			link: "javascript:alert(1)",
		})?.link,
	).toBe("https://books.example/invite/abc");
});

test("the resumed invite joins on arrival only when asked", () => {
	const invite = { server: "https://books.example", code: "abc", link: "x" };
	expect(inviteHref(invite).params).not.toHaveProperty("join");
	expect(inviteHref(invite, { join: true }).params.join).toBe("1");
});
