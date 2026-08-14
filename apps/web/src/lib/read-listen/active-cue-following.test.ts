import { describe, expect, it } from "bun:test";
import { resolveActiveCueFollowDecision } from "./active-cue-following";

const viewport = { start: 0, end: 1000 };

describe("active cue following", () => {
	it("does not scroll while the sentence remains in the reading comfort zone", () => {
		expect(
			resolveActiveCueFollowDecision({
				mode: "following",
				cue: { start: 360, end: 430 },
				viewport,
			}),
		).toEqual({ scroll: false, showResume: false });
	});

	it("moves once when narration leaves the comfort zone", () => {
		expect(
			resolveActiveCueFollowDecision({
				mode: "following",
				cue: { start: 820, end: 890 },
				viewport,
			}),
		).toEqual({ scroll: true, showResume: false });
	});

	it("lets manual reading win until the user resumes narration", () => {
		expect(
			resolveActiveCueFollowDecision({
				mode: "suspended",
				cue: { start: 820, end: 890 },
				viewport,
			}),
		).toEqual({ scroll: false, showResume: true });

		expect(
			resolveActiveCueFollowDecision({
				mode: "following",
				force: true,
				cue: { start: 360, end: 430 },
				viewport,
			}),
		).toEqual({ scroll: true, showResume: false });
	});

	it("accounts for reader chrome and the persistent player", () => {
		expect(
			resolveActiveCueFollowDecision({
				mode: "following",
				cue: { start: 720, end: 790 },
				viewport,
				startInset: 96,
				endInset: 180,
			}),
		).toEqual({ scroll: true, showResume: false });
	});

	it("keeps a visible sentence stable in paginated layouts", () => {
		expect(
			resolveActiveCueFollowDecision({
				mode: "following",
				strategy: "visibility",
				cue: { start: 780, end: 920 },
				viewport,
			}),
		).toEqual({ scroll: false, showResume: false });
	});
});
