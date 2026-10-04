import { describe, expect, test } from "bun:test";
import {
	positionForLoadedReader,
	restoredReaderPositionState,
} from "./reader-position";

describe("restored reader position state", () => {
	test("initializes the visible counter from a restored position", () => {
		expect(
			restoredReaderPositionState({
				exploredCharCount: 46_312,
				progress: 0.3401,
				modifiedAt: 1,
			}),
		).toMatchObject({ exploredCharCount: 46_312 });
	});

	test("uses zero only when no reading position exists", () => {
		expect(restoredReaderPositionState(undefined)).toEqual({
			position: undefined,
			exploredCharCount: 0,
		});
	});

	test("keeps the active coordinate when the loader revalidates", () => {
		const active = {
			exploredCharCount: 72,
			progress: 0.72,
			modifiedAt: 72,
		};
		const staleRestore = {
			exploredCharCount: 34,
			progress: 0.34,
			modifiedAt: 34,
		};

		expect(positionForLoadedReader(active, staleRestore)).toEqual({
			position: active,
			exploredCharCount: 72,
		});
	});
});
