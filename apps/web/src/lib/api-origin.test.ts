import { describe, expect, test } from "bun:test";
import { resolveApiOrigin } from "./api-origin";

describe("resolveApiOrigin", () => {
	test("uses the public origin in the browser", () => {
		expect(
			resolveApiOrigin({
				isSsr: false,
				publicOrigin: "https://library.example/api/",
				serverOrigin: "http://server:3000",
			}),
		).toBe("https://library.example/api");
	});

	test("prefers the runtime internal origin during SSR", () => {
		expect(
			resolveApiOrigin({
				isSsr: true,
				publicOrigin: "http://localhost:3000",
				serverOrigin: "http://server:3000/",
			}),
		).toBe("http://server:3000");
	});

	test("falls back to the public origin when the SSR override is missing", () => {
		expect(
			resolveApiOrigin({
				isSsr: true,
				publicOrigin: "https://library.example/",
			}),
		).toBe("https://library.example");
	});

	test("falls back to the public origin when the SSR override is empty", () => {
		expect(
			resolveApiOrigin({
				isSsr: true,
				publicOrigin: "https://library.example/",
				serverOrigin: "  ",
			}),
		).toBe("https://library.example");
	});

	test("fails clearly when the SSR override is not a valid URL", () => {
		expect(() =>
			resolveApiOrigin({
				isSsr: true,
				publicOrigin: "https://library.example",
				serverOrigin: "server:3000",
			}),
		).toThrow("Invalid URL in environment variable: SERVER_URL");
	});
});
