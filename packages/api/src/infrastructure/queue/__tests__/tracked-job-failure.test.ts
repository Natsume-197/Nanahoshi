import { describe, expect, mock, test } from "bun:test";
import { settleTrackedJobFailure } from "../tracked-job-failure";

describe("tracked terminal job failures", () => {
	test("settles both task and generation after Honomiya stalls terminally", async () => {
		const bumpFailed = mock(async () => undefined);
		const updateReadListenGenerationStatus = mock(async () => undefined);

		await settleTrackedJobFailure(
			{
				queueName: "read-listen-generation",
				jobId: "generation-1",
				taskId: "task-1",
				failedReason: "job stalled more than allowable limit",
			},
			{ bumpFailed, updateReadListenGenerationStatus },
		);

		expect(bumpFailed).toHaveBeenCalledWith("task-1", "generation-1");
		expect(updateReadListenGenerationStatus).toHaveBeenCalledWith(
			"task-1",
			"failed",
			"job stalled more than allowable limit",
		);
	});

	test("does not treat unrelated queues as Read & Listen generations", async () => {
		const bumpFailed = mock(async () => undefined);
		const updateReadListenGenerationStatus = mock(async () => undefined);

		await settleTrackedJobFailure(
			{
				queueName: "metadata-enrich",
				jobId: "job-1",
				taskId: "task-1",
				failedReason: "provider unavailable",
			},
			{ bumpFailed, updateReadListenGenerationStatus },
		);

		expect(bumpFailed).toHaveBeenCalledTimes(1);
		expect(updateReadListenGenerationStatus).not.toHaveBeenCalled();
	});
});
