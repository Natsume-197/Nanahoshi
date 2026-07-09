import { describe, expect, mock, test } from "bun:test";

/**
 * Fail-closed regression tests for the single-item service guards added in the
 * pre-launch audit: when a caller has no active organization (`serverId ===
 * undefined`), item-level read/write services must reject WITHOUT touching the
 * database — the tenant boundary can't be enforced, so access is denied.
 *
 * We mock only the Drizzle client as an empty object. If a guard is missing, the
 * service falls through to `repository.getByUuidAndMediaType(...)`, which calls
 * `db.select(...)` on `{}` and throws a TypeError. A correctly-guarded service
 * instead throws NotFoundError (code NOT_FOUND) before any repo/DB access — so
 * asserting the error code proves the guard short-circuited.
 */

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
		DOWNLOAD_SECRET: "00000000-0000-0000-0000-000000000001",
		CORS_ORIGIN: "http://localhost:3000",
		BETTER_AUTH_SECRET: "mock-secret-that-is-at-least-32-chars-long",
		BETTER_AUTH_URL: "http://localhost:3000",
		REDIS_HOST: "127.0.0.1",
		REDIS_PORT: 6379,
		SMTP_HOST: "smtp.example.com",
		SMTP_PORT: 465,
		SMTP_SECURE: true,
		SMTP_USER: "mock@example.com",
		SMTP_PASS: "mock",
		SEARCH_PROVIDER: "pgroonga",
	},
}));
mock.module("@nanahoshi-v2/db", () => ({ db: {} }));
// presence.service is imported by the progress services and may open Redis at
// import time; stub it (no dedicated test depends on the real module).
mock.module("../modules/presence/presence.service", () => ({
	markBookActivity: mock(async () => undefined),
}));

const audiobookService = await import("../routers/audiobooks/audiobook.service");
const readingProgress = await import(
	"../routers/reading-progress/reading-progress.service"
);
const listeningProgress = await import(
	"../routers/listening-progress/listening-progress.service"
);

async function expectNotFound(promise: Promise<unknown>) {
	let thrown: unknown;
	try {
		await promise;
	} catch (e) {
		thrown = e;
	}
	expect(thrown).toBeDefined();
	// NOT_FOUND (guard fired) — NOT a TypeError from db.select on {} (fell through).
	expect((thrown as { code?: string }).code).toBe("NOT_FOUND");
}

describe("audiobook service — fail closed without an active org", () => {
	test("getAudiobookDetails(serverId=undefined) rejects before any DB access", async () => {
		await expectNotFound(
			audiobookService.getAudiobookDetails("uuid", undefined, "ALL"),
		);
	});

	test("getAudioFile(serverId=undefined) rejects before any DB access", async () => {
		await expectNotFound(
			audiobookService.getAudioFile("uuid", 0, undefined, "ALL"),
		);
	});
});

describe("reading-progress service — fail closed without an active org", () => {
	test("saveProgress(serverId=undefined) rejects before any DB access", async () => {
		await expectNotFound(
			readingProgress.saveProgress("u1", "uuid", undefined, [], {
				status: "completed",
			}),
		);
	});

	test("getProgress(serverId=undefined) rejects before any DB access", async () => {
		await expectNotFound(
			readingProgress.getProgress("u1", "uuid", undefined, "ALL"),
		);
	});
});

describe("listening-progress service — fail closed without an active org", () => {
	test("saveProgress(serverId=undefined) rejects before any DB access", async () => {
		await expectNotFound(
			listeningProgress.saveProgress("u1", "uuid", undefined, [], {
				status: "completed",
			}),
		);
	});

	test("getProgress(serverId=undefined) rejects before any DB access", async () => {
		await expectNotFound(
			listeningProgress.getProgress("u1", "uuid", undefined, "ALL"),
		);
	});
});
