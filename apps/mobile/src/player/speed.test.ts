import { describe, expect, test } from "bun:test";
import { resolveBookSpeed } from "./speed";

describe("resolveBookSpeed", () => {
	test("a book with no speed of its own plays at the default", () => {
		expect(resolveBookSpeed({ fallback: 1.5 })).toEqual({
			rate: 1.5,
			override: false,
		});
	});

	test("the server's rate for the book wins over this phone's", () => {
		expect(resolveBookSpeed({ server: 2, local: 1.25, fallback: 1 })).toEqual({
			rate: 2,
			override: true,
		});
	});

	test("offline, the rate this phone remembers for the book applies", () => {
		expect(
			resolveBookSpeed({ server: null, local: 1.25, fallback: 1 }),
		).toEqual({ rate: 1.25, override: true });
	});

	test("a book saved at the default speed is no override", () => {
		expect(resolveBookSpeed({ server: 1.5, fallback: 1.5 }).override).toBe(
			false,
		);
	});
});
