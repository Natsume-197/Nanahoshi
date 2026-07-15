import { afterEach, describe, expect, mock, test } from "bun:test";

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

const { collectionsRepository } = await import("../collections.repository");
const collectionsService = await import("../collections.service");

const COLLECTION_ID = "11111111-1111-4111-8111-111111111111";
const originalGetByIdForUser = collectionsRepository.getByIdForUser;
const originalSetVisibility = collectionsRepository.setVisibility;

afterEach(() => {
	collectionsRepository.getByIdForUser = originalGetByIdForUser;
	collectionsRepository.setVisibility = originalSetVisibility;
});

describe("updateCollectionVisibility", () => {
	test("owner can toggle visibility and the new state is persisted", async () => {
		const setVisibility = mock(async () => undefined);
		collectionsRepository.getByIdForUser = mock(
			async () => ({ id: COLLECTION_ID, isPublic: false }) as never,
		);
		collectionsRepository.setVisibility = setVisibility as never;

		const result = await collectionsService.updateCollectionVisibility(
			"owner-1",
			{ collectionId: COLLECTION_ID, isPublic: true },
			"server-1",
		);

		expect(setVisibility).toHaveBeenCalledWith(COLLECTION_ID, true);
		expect(result).toEqual({ collectionId: COLLECTION_ID, isPublic: true });
	});

	test("non-owner (or wrong server) gets NOT_FOUND and nothing is written", async () => {
		const setVisibility = mock(async () => undefined);
		collectionsRepository.getByIdForUser = mock(async () => null) as never;
		collectionsRepository.setVisibility = setVisibility as never;

		let thrown: unknown;
		try {
			await collectionsService.updateCollectionVisibility(
				"intruder",
				{ collectionId: COLLECTION_ID, isPublic: true },
				"server-1",
			);
		} catch (e) {
			thrown = e;
		}

		expect((thrown as { code?: string }).code).toBe("NOT_FOUND");
		expect(setVisibility).not.toHaveBeenCalled();
	});
});
