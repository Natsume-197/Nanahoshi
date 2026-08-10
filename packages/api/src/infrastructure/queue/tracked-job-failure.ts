import type { QueueName } from "../../modules/tasks/task-registry";

export type TrackedJobFailure = {
	queueName: QueueName;
	jobId: string;
	taskId: string;
	failedReason?: string;
};

export type TrackedJobFailureDependencies = {
	bumpFailed: (taskId: string, jobId: string) => Promise<unknown>;
	updateReadListenGenerationStatus: (
		taskId: string,
		status: "failed",
		error: string,
	) => Promise<unknown>;
};

const MAX_FAILURE_LENGTH = 2_000;

/** Settle the user-facing task after BullMQ reports a terminal job failure. */
export async function settleTrackedJobFailure(
	input: TrackedJobFailure,
	dependencies: TrackedJobFailureDependencies,
): Promise<void> {
	const operations: Promise<unknown>[] = [
		dependencies.bumpFailed(input.taskId, input.jobId),
	];
	if (input.queueName === "read-listen-generation") {
		const reason = (
			input.failedReason?.trim() || "Honomiya generation failed"
		).slice(0, MAX_FAILURE_LENGTH);
		operations.push(
			dependencies.updateReadListenGenerationStatus(
				input.taskId,
				"failed",
				reason,
			),
		);
	}
	await Promise.all(operations);
}
