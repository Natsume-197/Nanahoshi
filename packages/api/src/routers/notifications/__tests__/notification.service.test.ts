import { beforeEach, describe, expect, mock, test } from "bun:test";

/**
 * Unit tests for the notification service: delivery seam (insert then
 * publish), self-suppression, follow vs follow_back, and task-finish
 * recipient resolution (library audience fan-out vs initiator).
 *
 * Run with:
 *   bun test packages/api/src/routers/notifications/__tests__/notification.service.test.ts
 */

let insertedRows: Array<{ userId: string; data: Record<string, unknown> }> = [];
let publishedEvents: Array<{
	userId: string;
	event: { kind: string; [key: string]: unknown };
}> = [];
let actorRef: Record<string, unknown> | null = null;
let activityContext: { ownerId: string; bookTitle: string | null } | null =
	null;
let libraryAudience: string[] = [];
let retractCalls: unknown[][] = [];

const insertAndPrune = mock(
	async (userId: string, data: Record<string, unknown>) => {
		insertedRows.push({ userId, data });
		return { id: insertedRows.length, userId, type: data.type, payload: data };
	},
);
const deleteByActorTarget = mock(async (...args: unknown[]) => {
	retractCalls.push(args);
});

// Benign db/env mocks so the real repository module can be imported below.
mock.module("@nanahoshi-v2/db", () => ({ db: {} }));
mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
	},
}));

// Re-export the real module and only override the singleton — hiding the
// NotificationRepository class would pollute notification.repository.test.ts
// (test files share one Bun process).
const realRepositoryModule = await import("../notification.repository");
mock.module("../notification.repository", () => ({
	...realRepositoryModule,
	notificationRepository: {
		insertAndPrune,
		deleteByActorTarget,
		deleteByComment: mock(async () => ["owner-1"]),
		getActorRef: mock(async () => actorRef),
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

mock.module("../../profile/profile.repository", () => ({
	activityRepository: {
		getActivityContext: mock(async () => activityContext),
	},
	profileRepository: {},
}));

mock.module("../../../auth/access.repository", () => ({
	getUsersWithLibraryAccess: mock(async () => libraryAudience),
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
		retractCalls = [];
		actorRef = { id: "actor-1", name: "Ana", username: "ana" };
		activityContext = { ownerId: "owner-1", bookTitle: "Some Book" };
		libraryAudience = [];
	});

	test("dispatch persists first, then publishes the inserted row per-user", async () => {
		await service.dispatch("user-1", {
			type: "follow",
			actor: {
				id: "actor-1",
				name: "Ana",
				username: "ana",
				displayUsername: null,
			},
		});

		expect(insertedRows).toHaveLength(1);
		expect(insertedRows[0]?.userId).toBe("user-1");
		expect(publishedEvents).toHaveLength(1);
		expect(publishedEvents[0]?.userId).toBe("user-1");
		expect(publishedEvents[0]?.event.kind).toBe("new");
	});

	test("read/delete mutations publish cross-tab sync events", async () => {
		await service.markAllRead("user-1");
		await service.markRead("user-1", [1, 2]);
		await service.deleteNotification("user-1", 3);

		expect(publishedEvents.map((e) => e.event.kind)).toEqual([
			"read_all",
			"read",
			"delete",
		]);
		expect(publishedEvents.every((e) => e.userId === "user-1")).toBe(true);
	});

	test("retracts publish a refresh so the recipient's tabs resync", async () => {
		await service.retractFollow({
			actorId: "actor-1",
			targetUserId: "target-1",
		});
		await service.retractComment(9);

		expect(publishedEvents.map((e) => [e.userId, e.event.kind])).toEqual([
			["target-1", "refresh"],
			["owner-1", "refresh"],
		]);
	});

	test("emitFollow targets the followed user and picks follow vs follow_back", async () => {
		await service.emitFollow({
			actorId: "actor-1",
			targetUserId: "target-1",
			mutual: false,
		});
		await service.emitFollow({
			actorId: "actor-1",
			targetUserId: "target-1",
			mutual: true,
		});

		expect(insertedRows.map((r) => r.data.type)).toEqual([
			"follow",
			"follow_back",
		]);
		expect(insertedRows.every((r) => r.userId === "target-1")).toBe(true);
	});

	test("emitActivityLike suppresses self-likes", async () => {
		activityContext = { ownerId: "actor-1", bookTitle: null };
		await service.emitActivityLike({ actorId: "actor-1", activityId: 5 });
		expect(insertedRows).toHaveLength(0);
	});

	test("emitActivityLike notifies the activity owner with the book title", async () => {
		await service.emitActivityLike({ actorId: "actor-1", activityId: 5 });

		expect(insertedRows).toHaveLength(1);
		expect(insertedRows[0]?.userId).toBe("owner-1");
		expect(insertedRows[0]?.data).toMatchObject({
			type: "activity_like",
			activityId: 5,
			bookTitle: "Some Book",
		});
	});

	test("emitActivityComment truncates the excerpt to 140 chars", async () => {
		await service.emitActivityComment({
			actorId: "actor-1",
			activityId: 5,
			commentId: 9,
			content: "x".repeat(500),
		});
		const insertedRow = insertedRows[0];
		if (!insertedRow) throw new Error("Expected notification to be inserted");
		expect((insertedRow.data.excerpt as string).length).toBe(140);
	});

	test("emitTaskFinished fans a library scan out to the library audience", async () => {
		libraryAudience = ["u1", "u2", "u3"];
		await service.emitTaskFinished({
			...baseTask,
			type: "library-scan",
			totalJobs: 10,
			userId: "initiator",
			libraryId: 42,
		});

		expect(insertedRows.map((r) => r.userId).sort()).toEqual([
			"u1",
			"u2",
			"u3",
		]);
		expect(insertedRows[0]?.data).toMatchObject({
			type: "task_finished",
			taskType: "library-scan",
			totalJobs: 10,
		});
	});

	test("no-change manual scan notifies only the initiator, not the audience", async () => {
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

	test("no-change scheduled scan (no initiator) notifies nobody", async () => {
		libraryAudience = ["u1"];
		await service.emitTaskFinished({
			...baseTask,
			type: "library-scan",
			totalJobs: 0,
			userId: null,
			libraryId: 42,
		});
		expect(insertedRows).toHaveLength(0);
	});

	test("emitTaskFinished sends personal tasks only to the initiator", async () => {
		await service.emitTaskFinished({
			...baseTask,
			type: "send-to-kindle",
			totalJobs: 1,
			completedJobs: 1,
			userId: "initiator",
			libraryId: null,
		});

		expect(insertedRows).toHaveLength(1);
		expect(insertedRows[0]?.userId).toBe("initiator");
	});

	test("auto-enrich notifies the scan initiator (inherited userId)", async () => {
		await service.emitTaskFinished({
			...baseTask,
			type: "metadata-enrich-auto",
			totalJobs: 120,
			completedJobs: 118,
			failedJobs: 2,
			userId: "scan-initiator",
			libraryId: 42,
		});

		expect(insertedRows).toHaveLength(1);
		expect(insertedRows[0]?.userId).toBe("scan-initiator");
		expect(insertedRows[0]?.data).toMatchObject({
			taskType: "metadata-enrich-auto",
		});
	});

	test("auto-enrich sealed empty (0 jobs) notifies nobody", async () => {
		await service.emitTaskFinished({
			...baseTask,
			type: "metadata-enrich-auto",
			totalJobs: 0,
			completedJobs: 0,
			userId: "scan-initiator",
			libraryId: 42,
		});
		expect(insertedRows).toHaveLength(0);
	});

	test("emitTaskFinished drops personal tasks without an initiator", async () => {
		await service.emitTaskFinished({
			...baseTask,
			type: "ranobedb-import",
			totalJobs: 100,
			userId: null,
			libraryId: null,
		});
		expect(insertedRows).toHaveLength(0);
	});

	test("retractFollow removes both follow and follow_back from that actor", async () => {
		await service.retractFollow({
			actorId: "actor-1",
			targetUserId: "target-1",
		});

		expect(retractCalls).toHaveLength(1);
		expect(retractCalls[0]).toEqual([
			"target-1",
			["follow", "follow_back"],
			"actor-1",
		]);
	});
});
