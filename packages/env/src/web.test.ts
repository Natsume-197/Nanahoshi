import { expect, test } from "bun:test";
import { resolvePublicOrigin } from "./web";

test("one build uses the current browser origin on localhost, LAN and HTTPS", () => {
	for (const origin of [
		"http://localhost:3000",
		"http://192.168.1.20:4000",
		"https://books.example",
	]) {
		expect(resolvePublicOrigin("", origin, undefined)).toBe(origin);
	}
});

test("SSR uses the runtime public URL and development retains its override", () => {
	expect(
		resolvePublicOrigin(undefined, undefined, "https://books.example/"),
	).toBe("https://books.example");
	expect(
		resolvePublicOrigin(
			"http://localhost:3000/",
			"http://localhost:3001",
			undefined,
		),
	).toBe("http://localhost:3000");
	expect(() =>
		resolvePublicOrigin(undefined, undefined, "file:///tmp/books"),
	).toThrow("Invalid public URL");
	expect(() => resolvePublicOrigin(undefined, undefined, undefined)).toThrow(
		"Missing public URL",
	);
});
