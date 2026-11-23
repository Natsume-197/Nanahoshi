import { describe, expect, mock, test } from "bun:test";

mock.module("expo-secure-store", () => ({
	getItem: () => null,
	setItemAsync: async () => {},
	deleteItemAsync: async () => {},
}));
const { pairFailure, parsePairLink, parsePairParams } = await import(
	"./pair-link"
);

const TOKEN = "Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z";

describe("pair link", () => {
	test("reads the web's QR", () => {
		const text = `nanahoshi://pair?${new URLSearchParams({ server: "http://192.168.1.7:7331/", token: TOKEN })}`;
		expect(parsePairLink(text)).toEqual({
			server: "http://192.168.1.7:7331",
			token: TOKEN,
		});
	});

	test("the development app reads it too", () => {
		expect(
			parsePairLink(
				`nanahoshi-dev://pair?server=books.example.com&token=${TOKEN}`,
			)?.server,
		).toBe("http://books.example.com");
	});

	test("ignores other codes a camera may see", () => {
		expect(parsePairLink("https://example.com/pair?token=x")).toBeNull();
		expect(
			parsePairLink(`nanahoshi://invite?server=a.example&token=${TOKEN}`),
		).toBeNull();
		expect(parsePairLink("just some text")).toBeNull();
		expect(
			parsePairLink("nanahoshi://pair?server=a.example&token=short"),
		).toBeNull();
	});

	test("route params need both a server and a code", () => {
		expect(parsePairParams({ server: "a.example" })).toBeNull();
		expect(parsePairParams({ token: TOKEN })).toBeNull();
	});
});

test("server refusals map to what the phone says", () => {
	expect(pairFailure({ status: 400, message: "PAIRING_EXPIRED" })).toBe(
		"expired",
	);
	expect(pairFailure({ status: 403, message: "PAIRING_REFUSED" })).toBe(
		"refused",
	);
	expect(pairFailure({ status: 500 })).toBe("failed");
});
