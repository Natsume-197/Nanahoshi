import { beforeEach, describe, expect, mock, test } from "bun:test";

let insertedRows: Array<{ userId: string; data: Record<string, unknown> }> = [];
let publishedEvents: Array<{
	userId: string;
	event: { kind: string; [key: string]: unknown };
}> = [];
let libraryAudience: string[] = [];

const insertAndPrune = mock(
	async (userId: string, data: Record<string, unknown>) => {
		insertedRows.push({ userId, data });
		return { id: insertedRows.length, userId, type: data.type, payload: data };
	},
);

mock.module("@nanahoshi-v2/db", () => ({ db: {} }));
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

const realRepositoryModule = await import("../notification.repository");
mock.module("../notification.repository", () => ({
	...realRepositoryModule,
	notificationRepository: {
		insertAndPrune,
		markAllRead: mock(async () => {}),
		markRead: mock(async () => {}),
		deleteById: mock(async () => {}),
	},
}));

mock.module("../notification.events", () => ({
	publishNotificationEvent: mock((userId: string, event: { kind: string }) => {
		publishedEvents.push({ userId, event });
	}),
	subscribeToNotifications: mock(() => () => {}),
}));

mock.module("../../../auth/access.repository", () => ({
	getUsersWithLibraryAccess: mock(async () => libraryAudience),
	invalidatePermissionCaches: mock(() => {}),
}));

const service = await import("../notification.service");

const baseTask = {
	id: "task-1",
	serverId: "server-A",
	label: "Scanning Novels",
	status: "completed" as const,
	completedJobs: 10,
	failedJobs: 0,
	createdAt: Date.now(),
	sealed: true,
};

describe("notification.service", () => {
	beforeEach(() => {
		insertedRows = [];
		publishedEvents = [];
		libraryAudience = [];
	});

	test("dispatch persists first, then publishes the inserted row", async () => {
		await service.dispatch("user-1", {
			type: "task_finished",
			taskId: "task-1",
			taskType: "send-to-kindle",
			label: "Some Book",
			totalJobs: 1,
			completedJobs: 1,
			failedJobs: 0,
		});

		expect(insertedRows).toHaveLength(1);
		expect(insertedRows[0]?.userId).toBe("user-1");
		expect(publishedEvents[0]?.event.kind).toBe("new");
	});

	test("read/delete mutations publish cross-tab sync events", async () => {
		await service.markAllRead("user-1");
		await service.markRead("user-1", [1, 2]);
		await service.deleteNotification("user-1", 3);

		expect(publishedEvents.map((event) => event.event.kind)).toEqual([
			"read_all",
			"read",
			"delete",
		]);
	});

	test("library tasks notify every member with library access", async () => {
		libraryAudience = ["u1", "u2", "u3"];
		await service.emitTaskFinished({
			...baseTask,
			type: "library-scan",
			totalJobs: 10,
			userId: "initiator",
			libraryId: 42,
		});

		expect(insertedRows.map((row) => row.userId).sort()).toEqual([
			"u1",
			"u2",
			"u3",
		]);
	});

	test("a no-change manual scan notifies only the initiator", async () => {
		libraryAudience = ["u1", "u2"];
		await service.emitTaskFinished({
			...baseTask,
			type: "library-scan",
			totalJobs: 0,
			userId: "initiator",
			libraryId: 42,
		});

		expect(insertedRows).toHaveLength(1);
		expect(insertedRows[0]?.userId).toBe("initiator");
	});

	test("personal tasks notify only their initiator", async () => {
		await service.emitTaskFinished({
			...baseTask,
			type: "send-to-kindle",
			totalJobs: 1,
			userId: "initiator",
			libraryId: null,
		});

		expect(insertedRows).toHaveLength(1);
		expect(insertedRows[0]?.userId).toBe("initiator");
	});

	test("personal tasks without an initiator are ignored", async () => {
		await service.emitTaskFinished({
			...baseTask,
			type: "ranobedb-import",
			totalJobs: 100,
			userId: null,
			libraryId: null,
		});

		expect(insertedRows).toHaveLength(0);
	});
});
