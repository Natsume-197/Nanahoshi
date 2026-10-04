import { expect, mock, test } from "bun:test";

mock.module("expo-secure-store", () => ({
	getItem: () => null,
	setItemAsync: async () => {},
}));
const { kindleEmailProblem } = await import("./kindle");

test("only Kindle addresses are accepted", () => {
	expect(kindleEmailProblem("me@kindle.com")).toBeNull();
	expect(kindleEmailProblem("  Me@Kindle.CO.JP ")).toBeNull();
	expect(kindleEmailProblem("me@gmail.com")).toBe("not_kindle");
	expect(kindleEmailProblem("me@kindle")).toBe("invalid");
	expect(kindleEmailProblem("")).toBe("invalid");
});
