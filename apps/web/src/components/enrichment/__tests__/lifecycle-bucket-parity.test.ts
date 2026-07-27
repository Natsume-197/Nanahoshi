import { describe, expect, test } from "bun:test";
import { LIFECYCLE_BUCKET as API_LIFECYCLE_BUCKET } from "@nanahoshi-v2/api/modules/metadataEnrichment/enrichment-lifecycle";
import { BUCKET_LIFECYCLES, LIFECYCLE_BUCKET } from "../filters";

describe("lifecycle → bucket mirror", () => {
	test("matches the API's map exactly", () => {
		// The sidebar derives the bucket to send alongside a lifecycle from the
		// web copy; if it drifted from the server's, those rows would query a
		// bucket the lifecycle can't appear in and always come back empty.
		expect(LIFECYCLE_BUCKET).toEqual(API_LIFECYCLE_BUCKET);
	});

	test("every lifecycle the sidebar groups under a bucket belongs to it", () => {
		for (const [bucket, lifecycles] of Object.entries(BUCKET_LIFECYCLES)) {
			for (const lifecycle of lifecycles ?? []) {
				expect(LIFECYCLE_BUCKET[lifecycle]).toBe(
					bucket as (typeof LIFECYCLE_BUCKET)[typeof lifecycle],
				);
			}
		}
	});
});
