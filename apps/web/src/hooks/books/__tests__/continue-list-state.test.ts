import { describe, expect, it } from "bun:test";
import { resolveIsInContinueList } from "../continue-list-state";

describe("resolveIsInContinueList", () => {
	it("trusts the rail hint while the progress query is in flight", () => {
		expect(
			resolveIsInContinueList({
				progress: undefined,
				isAudiobook: false,
				hint: true,
			}),
		).toBe(true);
	});

	it("hides the action for an unknown book with no hint", () => {
		expect(
			resolveIsInContinueList({ progress: undefined, isAudiobook: false }),
		).toBe(false);
	});

	it("lets a loaded empty progress row override the hint", () => {
		expect(
			resolveIsInContinueList({
				progress: null,
				isAudiobook: false,
				hint: true,
			}),
		).toBe(false);
	});

	it("lets a loaded non-reading status override the hint", () => {
		expect(
			resolveIsInContinueList({
				progress: { status: "unread" },
				isAudiobook: false,
				hint: true,
			}),
		).toBe(false);
	});

	it("matches reading for ebooks and listening for audiobooks", () => {
		expect(
			resolveIsInContinueList({
				progress: { status: "reading" },
				isAudiobook: false,
			}),
		).toBe(true);
		expect(
			resolveIsInContinueList({
				progress: { status: "reading" },
				isAudiobook: true,
			}),
		).toBe(false);
		expect(
			resolveIsInContinueList({
				progress: { status: "listening" },
				isAudiobook: true,
			}),
		).toBe(true);
	});
});
