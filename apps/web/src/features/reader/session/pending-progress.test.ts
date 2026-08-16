import { describe, expect, it } from "bun:test";
import { enqueuePendingProgress } from "./pending-progress";

describe("offline reader progress", () => {
	it("keeps independent time slices when the same book fails out of order", () => {
		const first = {
			syncOperationId: "00000000-0000-4000-8000-000000000001",
			bookUuid: "book-1",
			bookCharCount: 1_000,
			exploredCharCount: 300,
			positionIntentAt: 100,
			readingTimeSeconds: 60,
			status: "reading" as const,
		};
		const second = {
			...first,
			syncOperationId: "00000000-0000-4000-8000-000000000002",
			exploredCharCount: 700,
			positionIntentAt: 200,
			readingTimeSeconds: 5,
		};

		const queue = enqueuePendingProgress(
			enqueuePendingProgress({}, second, 200),
			first,
			300,
		);

		expect(Object.keys(queue)).toHaveLength(2);
		expect(
			Object.values(queue).reduce(
				(total, entry) => total + entry.readingTimeSeconds,
				0,
			),
		).toBe(65);
		expect(queue[first.syncOperationId]?.positionIntentAt).toBe(100);
		expect(queue[second.syncOperationId]?.positionIntentAt).toBe(200);
	});
});
