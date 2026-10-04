import { describe, expect, mock, test } from "bun:test";

mock.module("expo-secure-store", () => ({
	getItem: () => null,
	setItemAsync: async () => {},
}));

const { parseLastServer } = await import("./last-server");

describe("parseLastServer", () => {
	test("reads what was saved", () => {
		expect(
			parseLastServer('{"id":"o1","name":"Biblioteca","logo":"/logo.png"}'),
		).toEqual({ id: "o1", name: "Biblioteca", logo: "/logo.png" });
	});

	test("a server without logo keeps a null logo", () => {
		expect(parseLastServer('{"id":"o1","name":"Biblioteca"}')?.logo).toBeNull();
	});

	test("nothing saved, or something unreadable, is no server", () => {
		expect(parseLastServer(null)).toBeNull();
		expect(parseLastServer("{not json")).toBeNull();
		expect(parseLastServer('{"id":"o1"}')).toBeNull();
	});
});
