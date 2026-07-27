import { afterEach, describe, expect, test } from "bun:test";
import { enrichmentStateRepository } from "../enrichment.repository";
import { enrichmentService } from "../enrichment.service";

// Patch the singleton in place and restore after each test — mock.module() on a
// shared repository leaks into every other file in the same Bun process.
const original = {
	list: enrichmentStateRepository.list,
	countsByBucket: enrichmentStateRepository.countsByBucket,
	countsByLifecycle: enrichmentStateRepository.countsByLifecycle,
};

afterEach(() => {
	Object.assign(enrichmentStateRepository, original);
});

type CountsFilter = Parameters<
	typeof enrichmentStateRepository.countsByLifecycle
>[1];

function captureCountFilters() {
	const seen: { bucket?: CountsFilter; lifecycle?: CountsFilter } = {};
	enrichmentStateRepository.list = (async () => ({
		items: [],
		total: 0,
	})) as typeof enrichmentStateRepository.list;
	enrichmentStateRepository.countsByBucket = (async (
		_serverId: string,
		filter: CountsFilter,
	) => {
		seen.bucket = filter;
		return {
			in_progress: 0,
			attention: 0,
			stopped: 0,
			completed: 0,
			history: 0,
		};
	}) as typeof enrichmentStateRepository.countsByBucket;
	enrichmentStateRepository.countsByLifecycle = (async (
		_serverId: string,
		filter: CountsFilter,
	) => {
		seen.lifecycle = filter;
		return {};
	}) as typeof enrichmentStateRepository.countsByLifecycle;
	return seen;
}

describe("enrichmentService.list counts", () => {
	test("counts every lifecycle regardless of the selected bucket", async () => {
		// The sidebar shows all lifecycle rows at once; scoping the tally to the
		// open bucket would zero out every row outside it.
		const seen = captureCountFilters();
		await enrichmentService.list("server-1", {
			bucket: "attention",
			lifecycle: "no_match",
			limit: 50,
			offset: 0,
		});
		expect(seen.lifecycle?.bucket).toBeUndefined();
		expect(seen.lifecycle?.lifecycle).toBeUndefined();
	});

	test("carries the library, media type and failure scope into both tallies", async () => {
		// Narrowing to a library must renumber the sidebar, or the counts would
		// describe a list the user isn't looking at.
		const seen = captureCountFilters();
		await enrichmentService.list("server-1", {
			bucket: "attention",
			libraryUuid: "lib-1",
			mediaType: "ebook",
			withFailures: true,
			limit: 50,
			offset: 0,
		});
		for (const filter of [seen.bucket, seen.lifecycle]) {
			expect(filter?.libraryUuid).toBe("lib-1");
			expect(filter?.mediaType).toBe("ebook");
			expect(filter?.withFailures).toBe(true);
		}
	});

	test("the text query never narrows the counts", async () => {
		// Counts describe the whole scope so the sidebar stays a stable map while
		// you type in the search box.
		const seen = captureCountFilters();
		await enrichmentService.list("server-1", {
			query: "hobbit",
			limit: 50,
			offset: 0,
		});
		expect(seen.bucket).not.toHaveProperty("query");
		expect(seen.lifecycle).not.toHaveProperty("query");
	});
});
