import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";

mock.module("@nanahoshi-v2/db", () => ({ db: {} }));
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

const markActivityMock = mock(() => Promise.resolve());

mock.module("../presenceManager", () => ({
	markActivity: markActivityMock,
	clearActivity: mock(() => Promise.resolve()),
	getPresenceFor: mock(() => Promise.resolve(new Map())),
	subscribeToPresence: mock(() => ({ update: () => {}, close: () => {} })),
	syncStatus: mock(() => Promise.resolve()),
	heartbeatOnline: mock(() => Promise.resolve()),
	clearConnection: mock(() => Promise.resolve()),
	setIdle: mock(() => Promise.resolve()),
	setManualStatus: mock(() => Promise.resolve()),
}));

const { bookRepository } = await import(
	"../../../routers/books/book.repository"
);
const { profileRepository } = await import(
	"../../../routers/profile/profile.repository"
);
const { markBookActivity } = await import("../presence.service");

// Patch singletons in place — see bun mock-isolation convention.
let shareActivity = true;
let title: string | null = "Cosmos";
const titleSpy = spyOn(bookRepository, "getTitleById").mockImplementation(() =>
	Promise.resolve(title),
);
const shareSpy = spyOn(
	profileRepository,
	"getShareReadingActivity",
).mockImplementation(() => Promise.resolve(shareActivity));

beforeEach(() => {
	shareActivity = true;
	title = "Cosmos";
	markActivityMock.mockClear();
	titleSpy.mockClear();
	shareSpy.mockClear();
});

describe("markBookActivity", () => {
	test("marks activity with the resolved title when sharing is enabled", async () => {
		await markBookActivity("u1", 7, "uuid-7", "reading");
		expect(markActivityMock).toHaveBeenCalledWith("u1", "reading", {
			uuid: "uuid-7",
			title: "Cosmos",
		});
	});

	test("never writes activity for users who opted out of sharing", async () => {
		shareActivity = false;
		await markBookActivity("u1", 7, "uuid-7", "reading");
		expect(markActivityMock).not.toHaveBeenCalled();
	});

	test("never exposes a filename placeholder when metadata has no title", async () => {
		title = null;
		await markBookActivity("u1", 7, "uuid-7", "listening");
		expect(markActivityMock).not.toHaveBeenCalled();
	});

	test("is best-effort: a lookup failure never throws", async () => {
		titleSpy.mockImplementationOnce(() => Promise.reject(new Error("db down")));
		await markBookActivity("u1", 7, "uuid-7", "listening");
		expect(markActivityMock).not.toHaveBeenCalled();
	});
});
