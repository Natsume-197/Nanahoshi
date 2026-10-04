import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("@nanahoshi/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
		DOWNLOAD_SECRET: "00000000-0000-0000-0000-000000000001",
		CORS_ORIGIN: "http://localhost:3000",
		BETTER_AUTH_SECRET: "mock-secret-that-is-at-least-32-chars-long",
		BETTER_AUTH_URL: "http://localhost:3000",
		REDIS_HOST: "127.0.0.1",
		REDIS_PORT: 6379,
	},
}));
mock.module("@nanahoshi/db", () => ({ db: {} }));
const enqueueUserRefresh = mock(async () => undefined);
mock.module(
	"../../../modules/recommendations/recommendation.scheduler",
	() => ({
		enqueueUserRefresh,
	}),
);

const { collectionsRepository } = await import("../collections.repository");
const { bookRepository } = await import("../../books/book.repository");
const collectionsService = await import("../collections.service");

const COLLECTION_ID = "11111111-1111-4111-8111-111111111111";
const BOOK_UUID = "22222222-2222-4222-8222-222222222222";
const original = {
	getByIdForUser: collectionsRepository.getByIdForUser,
	addBook: collectionsRepository.addBook,
	removeBook: collectionsRepository.removeBook,
	touch: collectionsRepository.touch,
	deleteByIdForUser: collectionsRepository.deleteByIdForUser,
	getByUuid: bookRepository.getByUuid,
};

beforeEach(() => {
	enqueueUserRefresh.mockClear();
	collectionsRepository.touch = mock(async () => undefined) as never;
	bookRepository.getByUuid = mock(async () => ({ id: 7 })) as never;
});

afterEach(() => {
	Object.assign(collectionsRepository, {
		getByIdForUser: original.getByIdForUser,
		addBook: original.addBook,
		removeBook: original.removeBook,
		touch: original.touch,
		deleteByIdForUser: original.deleteByIdForUser,
	});
	bookRepository.getByUuid = original.getByUuid;
});

const ownCollection = (kind: "manual" | "dynamic") => {
	collectionsRepository.getByIdForUser = mock(
		async () => ({ id: COLLECTION_ID, kind }) as never,
	);
};

// Saving to a collection replaced likes as the explicit taste signal.
describe("collections feed recommendations", () => {
	test("saving a book to a collection refreshes the owner's recommendations", async () => {
		ownCollection("manual");
		collectionsRepository.addBook = mock(async () => true) as never;

		await collectionsService.setBookMembership(
			"user-1",
			{ collectionId: COLLECTION_ID, bookUuid: BOOK_UUID, inCollection: true },
			"server-1",
		);

		expect(enqueueUserRefresh).toHaveBeenCalledWith("server-1", "user-1");
	});

	test("removing it refreshes too, but a no-op change does not", async () => {
		ownCollection("manual");
		collectionsRepository.removeBook = mock(async () => true) as never;
		await collectionsService.setBookMembership(
			"user-1",
			{ collectionId: COLLECTION_ID, bookUuid: BOOK_UUID, inCollection: false },
			"server-1",
		);
		expect(enqueueUserRefresh).toHaveBeenCalledTimes(1);

		collectionsRepository.addBook = mock(async () => false) as never;
		await collectionsService.setBookMembership(
			"user-1",
			{ collectionId: COLLECTION_ID, bookUuid: BOOK_UUID, inCollection: true },
			"server-1",
		);
		expect(enqueueUserRefresh).toHaveBeenCalledTimes(1);
	});

	test("deleting a manual collection drops its signal; a dynamic one has none", async () => {
		collectionsRepository.deleteByIdForUser = mock(
			async () => undefined,
		) as never;

		ownCollection("dynamic");
		await collectionsService.deleteCollection(
			"user-1",
			COLLECTION_ID,
			"server-1",
		);
		expect(enqueueUserRefresh).not.toHaveBeenCalled();

		ownCollection("manual");
		await collectionsService.deleteCollection(
			"user-1",
			COLLECTION_ID,
			"server-1",
		);
		expect(enqueueUserRefresh).toHaveBeenCalledWith("server-1", "user-1");
	});
});
