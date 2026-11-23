import { describe, expect, test } from "bun:test";
import {
	formatCountdown,
	isLoopbackOrigin,
	pairAppLink,
} from "./mobile-connect-link";

describe("mobile connect link", () => {
	test("carries the API origin and code for the phone to read back", () => {
		const url = new URL(pairAppLink("http://192.168.1.7:7331", "abc_123"));
		expect(url.protocol).toBe("nanahoshi:");
		expect(url.searchParams.get("server")).toBe("http://192.168.1.7:7331");
		expect(url.searchParams.get("token")).toBe("abc_123");
	});

	test("flags addresses a phone can't reach", () => {
		expect(isLoopbackOrigin("http://localhost:7331")).toBe(true);
		expect(isLoopbackOrigin("http://127.0.0.1:3000")).toBe(true);
		expect(isLoopbackOrigin("http://[::1]:7331")).toBe(true);
		expect(isLoopbackOrigin("http://192.168.1.7:7331")).toBe(false);
		expect(isLoopbackOrigin("https://books.example.com")).toBe(false);
	});

	test("countdown rounds up to whole seconds and never goes negative", () => {
		expect(formatCountdown(245_000)).toBe("4:05");
		expect(formatCountdown(500)).toBe("0:01");
		expect(formatCountdown(-10)).toBe("0:00");
	});
});
