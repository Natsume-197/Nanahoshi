import { afterEach, describe, expect, mock, test } from "bun:test";
import { BadRequestError } from "../../../errors";
import { libraryRepository } from "../../libraries/library.repository";
import { enrichmentStateRepository } from "../enrichment.repository";
import { enrichmentService } from "../enrichment.service";

const original = {
	findLibrary: libraryRepository.findByUuid,
	updateLibrary: libraryRepository.update,
	providerFailureSummary: enrichmentStateRepository.providerFailureSummary,
	retry: enrichmentService.retry,
};

afterEach(() => {
	libraryRepository.findByUuid = original.findLibrary;
	libraryRepository.update = original.updateLibrary;
	enrichmentStateRepository.providerFailureSummary =
		original.providerFailureSummary;
	enrichmentService.retry = original.retry;
});

function stubLibrary() {
	libraryRepository.findByUuid = (async () => ({
		id: 16,
		uuid: "lib-1",
		mediaType: "ebook",
		metadataProviders: ["ranobedb", "amazon"],
	})) as typeof libraryRepository.findByUuid;
}

describe("enrichmentService.resolveProviderFailures", () => {
	test("cannot disable a provider whose only failures are transient", async () => {
		stubLibrary();
		enrichmentStateRepository.providerFailureSummary =
			(async () => ({})) as typeof enrichmentStateRepository.providerFailureSummary;
		const update = mock(() => Promise.resolve());
		const retry = mock(() => Promise.resolve({ enqueued: 0 }));
		libraryRepository.update = update as typeof libraryRepository.update;
		enrichmentService.retry = retry as typeof enrichmentService.retry;

		await expect(
			enrichmentService.resolveProviderFailures("server-1", {
				libraryUuid: "lib-1",
				providers: ["amazon"],
			}),
		).rejects.toBeInstanceOf(BadRequestError);
		expect(update).not.toHaveBeenCalled();
		expect(retry).not.toHaveBeenCalled();
	});

	test("disables and reprocesses a provider with permanent failures", async () => {
		stubLibrary();
		enrichmentStateRepository.providerFailureSummary = (async () => ({
			amazon: 3,
		})) as typeof enrichmentStateRepository.providerFailureSummary;
		const update = mock(() => Promise.resolve());
		const retry = mock(() => Promise.resolve({ enqueued: 3 }));
		libraryRepository.update = update as typeof libraryRepository.update;
		enrichmentService.retry = retry as typeof enrichmentService.retry;

		const result = await enrichmentService.resolveProviderFailures("server-1", {
			libraryUuid: "lib-1",
			providers: ["amazon"],
		});

		expect(update).toHaveBeenCalledWith(
			16,
			{ metadataProviders: ["ranobedb"] },
			"server-1",
		);
		expect(retry).toHaveBeenCalled();
		expect(result).toEqual({ disabled: true, reprocessed: 3 });
	});
});
