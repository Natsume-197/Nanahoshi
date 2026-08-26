import { describe, expect, mock, test } from "bun:test";
import type { Task } from "../../../modules/taskManager";
import type {
	ReadListenMatchAnalysisRow,
	ReadListenPublication,
} from "../read-listen.repository";
import {
	ReadListenMatchAnalysisCoordinator,
	type ReadListenMatchAnalysisJobData,
} from "../read-listen-match-analysis";

function analysisRow(overrides: Partial<ReadListenMatchAnalysisRow> = {}) {
	return {
		id: "00000000-0000-4000-8000-000000000100",
		taskId: "00000000-0000-4000-8000-000000000101",
		serverId: "server-1",
		requestedByUserId: "user-1",
		matcherVersion: "rules-v6",
		status: "queued" as const,
		candidateCount: 0,
		completedCount: 0,
		skippedCount: 0,
		failedCount: 0,
		proposalCount: 0,
		error: null,
		createdAt: "2026-08-25T00:00:00.000Z",
		startedAt: null,
		finishedAt: null,
		updatedAt: "2026-08-25T00:00:00.000Z",
		...overrides,
	} satisfies ReadListenMatchAnalysisRow;
}

function audiobook(index: number): ReadListenPublication {
	return {
		id: index,
		catalogHash: `audio-${index}`,
		uuid: `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`,
		mediaType: "audiobook",
		filename: `${index}.m4b`,
		title: `Book ${index}`,
		cover: null,
		mainColor: null,
		languageCode: null,
		duration: 100,
		abridged: false,
		libraryUuid: "00000000-0000-4000-8000-000000000200",
		libraryName: "Audio",
		authors: [],
		narrators: [],
		series: [],
	};
}

function createHarness(candidates: ReadListenPublication[]) {
	const row = analysisRow({ candidateCount: candidates.length });
	const store = {
		listUnevaluatedCanonicalAudiobooks: mock(() => Promise.resolve(candidates)),
		createMatchAnalysisAttempt: mock(() =>
			Promise.resolve({ analysis: row, reused: false }),
		),
		updateMatchAnalysisStatus: mock(() => Promise.resolve(row)),
	};
	const tasks = {
		create: mock(() => Promise.resolve({} as Task)),
		fail: mock(() => Promise.resolve(null)),
		finalize: mock(() => Promise.resolve(null)),
		get: mock(() => Promise.resolve(null)),
	};
	const queue = {
		addBulk: mock(
			(
				_jobs: Array<{
					name: string;
					data: ReadListenMatchAnalysisJobData;
				}>,
			) => Promise.resolve([]),
		),
	};
	const coordinator = new ReadListenMatchAnalysisCoordinator(
		store as never,
		tasks,
		queue as never,
		async () => [7],
	);
	return { coordinator, store, tasks, queue, row };
}

describe("ReadListenMatchAnalysisCoordinator", () => {
	test("fans out every eligible audiobook without exposing a batch limit", async () => {
		const candidates = Array.from({ length: 125 }, (_, index) =>
			audiobook(index + 1),
		);
		const { coordinator, queue, tasks } = createHarness(candidates);

		await coordinator.enqueue({
			serverId: "server-1",
			requestedByUserId: "user-1",
		});

		expect(tasks.create).toHaveBeenCalledWith(
			expect.objectContaining({ totalJobs: 125, sealed: true }),
		);
		expect(queue.addBulk.mock.calls[0]?.[0]).toHaveLength(125);
	});

	test("completes immediately when every audiobook already has an evaluation", async () => {
		const { coordinator, queue, tasks, store } = createHarness([]);

		await coordinator.enqueue({
			serverId: "server-1",
			requestedByUserId: "user-1",
		});

		expect(queue.addBulk).not.toHaveBeenCalled();
		expect(store.updateMatchAnalysisStatus).toHaveBeenCalledWith(
			expect.any(String),
			"completed",
		);
		expect(tasks.finalize).toHaveBeenCalledTimes(1);
	});

	test("reuses the active task for the same user, server and matcher version", async () => {
		const { coordinator, store, tasks, queue, row } = createHarness([
			audiobook(1),
		]);
		store.createMatchAnalysisAttempt.mockResolvedValueOnce({
			analysis: row,
			reused: true,
		});
		tasks.get.mockResolvedValueOnce({ status: "running" } as Task);

		const result = await coordinator.enqueue({
			serverId: "server-1",
			requestedByUserId: "user-1",
		});

		expect(result).toEqual(
			expect.objectContaining({ taskId: row.taskId, reused: true }),
		);
		expect(tasks.create).not.toHaveBeenCalled();
		expect(queue.addBulk).not.toHaveBeenCalled();
	});

	test("reuses a fresh queued claim while its task is still being created", async () => {
		const { coordinator, store, tasks, queue, row } = createHarness([
			audiobook(1),
		]);
		store.createMatchAnalysisAttempt.mockResolvedValueOnce({
			analysis: analysisRow({
				...row,
				status: "queued",
				createdAt: new Date().toISOString(),
			}),
			reused: true,
		});

		const result = await coordinator.enqueue({
			serverId: "server-1",
			requestedByUserId: "user-1",
		});

		expect(result.reused).toBe(true);
		expect(tasks.create).not.toHaveBeenCalled();
		expect(queue.addBulk).not.toHaveBeenCalled();
	});
});
