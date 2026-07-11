import { describe, expect, it } from "bun:test";
import { isReportableMediaError } from "../media-error";

// MediaError codes: 1 ABORTED, 2 NETWORK, 3 DECODE, 4 SRC_NOT_SUPPORTED.
describe("isReportableMediaError", () => {
	it("reports a real network failure on an active source", () => {
		expect(
			isReportableMediaError({
				currentSrc: "http://localhost/stream/abc/0",
				error: { code: 2 },
			}),
		).toBe(true);
	});

	it("reports a decode / unsupported-source failure", () => {
		expect(
			isReportableMediaError({
				currentSrc: "http://localhost/stream/abc/0",
				error: { code: 4 },
			}),
		).toBe(true);
	});

	it("ignores errors after stop() cleared the source", () => {
		expect(isReportableMediaError({ currentSrc: "", error: { code: 4 } })).toBe(
			false,
		);
	});

	it("ignores aborted loads from a src swap (file/book switch)", () => {
		expect(
			isReportableMediaError({
				currentSrc: "http://localhost/stream/abc/1",
				error: { code: 1 },
			}),
		).toBe(false);
	});

	it("reports an error with no MediaError attached but an active source", () => {
		expect(
			isReportableMediaError({
				currentSrc: "http://localhost/stream/abc/0",
				error: null,
			}),
		).toBe(true);
	});
});
