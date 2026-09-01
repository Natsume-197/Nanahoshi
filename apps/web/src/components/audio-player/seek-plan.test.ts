import { describe, expect, test } from "bun:test";
import { shouldFlushPendingSeek } from "./seek-plan";

describe("shouldFlushPendingSeek", () => {
	test("waits for playable media before restoring a paused position", () => {
		expect(shouldFlushPendingSeek(6053, 1)).toBe(false);
		expect(shouldFlushPendingSeek(6053, 2)).toBe(false);
		expect(shouldFlushPendingSeek(6053, 3)).toBe(true);
	});
});
