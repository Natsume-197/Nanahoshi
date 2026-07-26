import { describe, expect, test } from "bun:test";
import { metadataRetryJob } from "./metadata-retry.job";

describe("metadata retry scheduler", () => {
	test("puts the durable generation in both the job payload and id", () => {
		expect(
			metadataRetryJob({
				bookId: 42,
				uuid: "8f6a85d8-cfc3-46f0-a444-052f6c779e15",
				mediaType: "ebook",
				providerAttempts: 2,
				retryGeneration: 7,
			}),
		).toEqual({
			name: "enrich-book",
			data: {
				bookId: 42,
				uuid: "8f6a85d8-cfc3-46f0-a444-052f6c779e15",
				retryGeneration: 7,
			},
			opts: {
				jobId: "metadata-auto-retry-42-7-2",
				removeOnComplete: true,
				removeOnFail: true,
				attempts: 1,
			},
		});
	});
});
