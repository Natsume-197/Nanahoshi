import {
	afterAll,
	beforeEach,
	describe,
	expect,
	it,
	mock,
	setSystemTime,
} from "bun:test";
import { CONTENT_TASK_TYPES } from "@nanahoshi-v2/api/modules/tasks/task-registry";

const invalidateQueries = mock((_filters?: { queryKey: string[] }) =>
	Promise.resolve(),
);
const setQueriesData = mock(() => []);

const keyFactory = (path: string[]) => ({
	key: () => path,
	queryOptions: () => ({ queryKey: path }),
});

// Real @/utils/orpc validates VITE_SERVER_URL at import; mock BEFORE importing
// the hook. Export every name the real module has (client included) so this
// mock doesn't shadow exports other test files rely on.
mock.module("@/utils/orpc", () => ({
	client: {},
	orpc: {
		tasks: {
			getActiveTasks: keyFactory(["tasks", "getActiveTasks"]),
			getAllTasks: keyFactory(["tasks", "getAllTasks"]),
		},
		books: {
			listRecent: keyFactory(["books", "listRecent"]),
			listRandom: keyFactory(["books", "listRandom"]),
			availableFormats: keyFactory(["books", "availableFormats"]),
		},
		audiobooks: {
			listRecent: keyFactory(["audiobooks", "listRecent"]),
		},
		recommendations: keyFactory(["recommendations"]),
	},
	queryClient: { invalidateQueries, setQueriesData },
}));

let capturedOnMessage: ((data: unknown) => void) | undefined;
// Real useGatewayChannel calls useEffect, which throws outside React.
mock.module("@/lib/gateway/use-gateway-channel", () => ({
	useGatewayChannel: (
		_ns: string,
		onMessage: (data: unknown) => void,
		_onOpen?: () => void,
	) => {
		capturedOnMessage = onMessage;
	},
}));

const { useTaskEvents } = await import("../use-task-events");

const contentType = [...CONTENT_TASK_TYPES][0];
const THROTTLE_MS = 4000;
let clock = Date.now();

function advanceClock(ms: number) {
	clock += ms;
	setSystemTime(new Date(clock));
}

function emitTask(overrides: Record<string, unknown> = {}) {
	capturedOnMessage?.({
		id: "task-1",
		type: contentType,
		status: "running",
		createdAt: clock,
		...overrides,
	});
}

describe("useTaskEvents content refresh", () => {
	beforeEach(() => {
		capturedOnMessage = undefined;
		useTaskEvents();
		// The throttle timestamp is module state; step past it so each test
		// starts with an open throttle window, then discard the bookkeeping.
		advanceClock(THROTTLE_MS + 1);
		invalidateQueries.mockClear();
		setQueriesData.mockClear();
	});

	afterAll(() => {
		setSystemTime();
	});

	it("only refreshes recently-added rows while a content task runs", () => {
		emitTask();
		expect(invalidateQueries.mock.calls).toEqual([
			[{ queryKey: ["books", "listRecent"] }],
			[{ queryKey: ["audiobooks", "listRecent"] }],
			[{ queryKey: ["books", "availableFormats"] }],
		]);
	});

	it("throttles running-task refreshes", () => {
		emitTask();
		invalidateQueries.mockClear();

		advanceClock(THROTTLE_MS - 100);
		emitTask();
		expect(invalidateQueries).not.toHaveBeenCalled();

		advanceClock(200);
		emitTask();
		expect(invalidateQueries.mock.calls).toEqual([
			[{ queryKey: ["books", "listRecent"] }],
			[{ queryKey: ["audiobooks", "listRecent"] }],
			[{ queryKey: ["books", "availableFormats"] }],
		]);
	});

	it("does a full invalidation when the task finishes", () => {
		emitTask({ status: "completed" });
		expect(invalidateQueries).toHaveBeenCalledTimes(1);
		expect(invalidateQueries).toHaveBeenCalledWith();
	});

	it("finishing bypasses the throttle", () => {
		emitTask();
		invalidateQueries.mockClear();
		emitTask({ status: "completed" });
		expect(invalidateQueries).toHaveBeenCalledTimes(1);
		expect(invalidateQueries).toHaveBeenCalledWith();
	});

	it("ignores tasks that do not modify content", () => {
		emitTask({ type: "cover-ingest" });
		emitTask({ type: "cover-ingest", status: "completed" });
		expect(invalidateQueries).not.toHaveBeenCalled();
	});

	it("refreshes recommendations when a rebuild task finishes", () => {
		emitTask({ type: "recommendations-rebuild", status: "running" });
		expect(invalidateQueries).not.toHaveBeenCalled();

		emitTask({ type: "recommendations-rebuild", status: "completed" });
		expect(invalidateQueries).toHaveBeenCalledTimes(1);
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["recommendations"],
		});
	});

	it("refreshes recommendations when a feeds refresh task finishes", () => {
		emitTask({ type: "recommendations-feeds", status: "running" });
		expect(invalidateQueries).not.toHaveBeenCalled();

		emitTask({ type: "recommendations-feeds", status: "completed" });
		expect(invalidateQueries).toHaveBeenCalledTimes(1);
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["recommendations"],
		});
	});
});
