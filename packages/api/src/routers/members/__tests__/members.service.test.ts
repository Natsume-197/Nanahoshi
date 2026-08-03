import { beforeEach, describe, expect, mock, spyOn, test } from "bun:test";
import type { PresenceEvent } from "../../../modules/presence/presence.types";

mock.module("@nanahoshi-v2/db", () => ({ db: {} }));
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

/** What the mocked getPresenceFor resolves to; per-test configurable. */
let presenceResult = new Map<string, PresenceEvent>();
const getPresenceForMock = mock((_ids: string[]) =>
	Promise.resolve(presenceResult),
);

mock.module("../../../modules/presence/presenceManager", () => ({
	getPresenceFor: getPresenceForMock,
	subscribeToPresence: mock(() => ({ update: () => {}, close: () => {} })),
	syncStatus: mock(() => Promise.resolve()),
	heartbeatOnline: mock(() => Promise.resolve()),
	clearConnection: mock(() => Promise.resolve()),
	markActivity: mock(() => Promise.resolve()),
	clearActivity: mock(() => Promise.resolve()),
	setIdle: mock(() => Promise.resolve()),
	setManualStatus: mock(() => Promise.resolve()),
}));

const { membersRepository } = await import("../members.repository");
const { getWithPresence, MEMBER_LIST_LIMIT } = await import(
	"../members.service"
);

const memberRow = (id: string, name: string) => ({
	id,
	name,
	username: name.toLowerCase(),
	displayUsername: null,
	image: null,
});

// Patch the repository singleton in place (module mocks leak across test files
// in the shared bun process and would hide the real repository).
let repoRows: ReturnType<typeof memberRow>[] = [];
const listSpy = spyOn(membersRepository, "list").mockImplementation(
	() => Promise.resolve(repoRows) as ReturnType<typeof membersRepository.list>,
);

beforeEach(() => {
	repoRows = [];
	presenceResult = new Map();
	listSpy.mockClear();
	getPresenceForMock.mockClear();
});

describe("getWithPresence", () => {
	test("caps the roster query at MEMBER_LIST_LIMIT", async () => {
		await getWithPresence("server-1");
		expect(listSpy).toHaveBeenCalledWith("server-1", MEMBER_LIST_LIMIT);
	});

	test("merges live presence and defaults missing users to offline", async () => {
		repoRows = [memberRow("u1", "Alice"), memberRow("u2", "Bob")];
		presenceResult = new Map([
			[
				"u1",
				{
					userId: "u1",
					state: "reading",
					book: { uuid: "b1", title: "Book" },
				},
			],
		]);

		const result = await getWithPresence("server-1");

		expect(getPresenceForMock).toHaveBeenCalledWith(["u1", "u2"]);
		expect(result).toEqual([
			expect.objectContaining({
				id: "u1",
				state: "reading",
				book: { uuid: "b1", title: "Book" },
			}),
			expect.objectContaining({ id: "u2", state: "offline", book: null }),
		]);
	});

	test("sorts by state weight, then name (deterministic, case-insensitive)", async () => {
		repoRows = [
			memberRow("u1", "zoe"),
			memberRow("u2", "Adam"),
			memberRow("u3", "beth"),
			memberRow("u4", "carl"),
		];
		presenceResult = new Map<string, PresenceEvent>([
			["u1", { userId: "u1", state: "online", book: null }],
			["u3", { userId: "u3", state: "online", book: null }],
			[
				"u4",
				{
					userId: "u4",
					state: "listening",
					book: { uuid: "b2", title: "Audio" },
				},
			],
		]);

		const result = await getWithPresence("server-1");

		// carl is active (weight 0), then online sorted by name, offline last.
		expect(result.map((r) => r.name)).toEqual(["carl", "beth", "zoe", "Adam"]);
	});
});
