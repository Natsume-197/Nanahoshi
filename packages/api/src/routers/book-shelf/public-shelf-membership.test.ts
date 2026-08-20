import { beforeEach, describe, expect, mock, test } from "bun:test";

const isMember = mock(async () => true);
const getBookUserId = mock(async () => "target-user");
const getAudioUserId = mock(async () => "target-user");
const listBooks = mock(async () => [{ bookId: 1 }]);
const listAudiobooks = mock(async () => [{ bookId: 2 }]);

mock.module("../members/members.repository", () => ({
	membersRepository: { isMember },
}));
mock.module("./book-shelf.repository", () => ({
	bookShelfRepository: {
		getUserIdByUsername: getBookUserId,
		listByStatus: listBooks,
	},
}));
mock.module("../audiobook-shelf/audiobook-shelf.repository", () => ({
	audiobookShelfRepository: {
		getUserIdByUsername: getAudioUserId,
		listByStatus: listAudiobooks,
	},
}));
mock.module("../../modules/recommendations/recommendation.scheduler", () => ({
	enqueueUserRefresh: mock(() => Promise.resolve()),
}));
mock.module("../books/book.repository", () => ({ bookRepository: {} }));

const bookShelf = await import("./book-shelf.service");
const audiobookShelf = await import(
	"../audiobook-shelf/audiobook-shelf.service"
);

describe("public shelves are scoped to current server members", () => {
	beforeEach(() => {
		isMember.mockClear();
		listBooks.mockClear();
		listAudiobooks.mockClear();
	});

	test("hides book activity after membership is revoked", async () => {
		isMember.mockImplementationOnce(async () => false);
		expect(
			await bookShelf.listPublicShelf("former", "server-a", "ALL"),
		).toEqual([]);
		expect(listBooks).not.toHaveBeenCalled();
	});

	test("hides audiobook activity after membership is revoked", async () => {
		isMember.mockImplementationOnce(async () => false);
		expect(
			await audiobookShelf.listPublicShelf("former", "server-a", "ALL"),
		).toEqual([]);
		expect(listAudiobooks).not.toHaveBeenCalled();
	});
});
