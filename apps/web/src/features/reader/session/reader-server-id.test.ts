import { describe, expect, it } from "bun:test";
import { resolveReaderServerId } from "./reader-server-id";

describe("resolveReaderServerId", () => {
	it("prefers the server the book was resolved in", () => {
		expect(
			resolveReaderServerId({
				switchedOrgId: "book-server",
				activeOrgId: "active",
				activeOrgPending: false,
				sessionServerId: "session",
			}),
		).toBe("book-server");
	});

	it("uses the loaded active server over the session", () => {
		expect(
			resolveReaderServerId({
				switchedOrgId: null,
				activeOrgId: "active",
				activeOrgPending: false,
				sessionServerId: "stale-session",
			}),
		).toBe("active");
	});

	it("starts from the session server while the org store loads", () => {
		expect(
			resolveReaderServerId({
				switchedOrgId: null,
				activeOrgId: null,
				activeOrgPending: true,
				sessionServerId: "session",
			}),
		).toBe("session");
	});

	it("has no server once the store settles without one", () => {
		expect(
			resolveReaderServerId({
				switchedOrgId: null,
				activeOrgId: null,
				activeOrgPending: false,
				sessionServerId: "session",
			}),
		).toBeNull();
	});
});
