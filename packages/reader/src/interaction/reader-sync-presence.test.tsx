import "@nanahoshi/test-utils/setup-dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { renderBindingHook } from "@nanahoshi/test-utils/render-binding-hook";
import { act, cleanup } from "@testing-library/react";
import { bindFakeReaderHost } from "../host/fake-reader-host";

const saveReading = mock(() => Promise.resolve());
const clearActivity = mock(() => Promise.resolve());

bindFakeReaderHost({
	readingProgress: { saveProgress: saveReading },
	presence: { clearActivity },
});
mock.module("@nanahoshi/ui/hooks/use-document-event", () => ({
	useDocumentEvent: () => {},
}));
mock.module("@nanahoshi/ui/hooks/use-window-event", () => ({
	useWindowEvent: () => {},
}));
mock.module("@nanahoshi/ui/hooks/use-interval", () => ({
	useInterval: () => {},
}));
mock.module("../renderers/shared/reading-time-slice", () => ({
	claimReadingTimeSlice: () => 0,
}));
const { useReaderSync } = await import("./use-reader-sync");

const counts = () => ({
	exploredCharCount: 12,
	bookCharCount: 120,
	positionIntentAt: 1,
});

afterEach(() => {
	cleanup();
	saveReading.mockClear();
	clearActivity.mockClear();
});

describe("reading activity lifecycle", () => {
	test("announces reading when the document becomes ready after mount", async () => {
		const { rerender } = renderBindingHook(
			({ enabled }) =>
				useReaderSync({ enabled, bookUuid: "book-1", getCharCounts: counts }),
			{ initialProps: { enabled: false } },
		);

		await act(async () => {
			rerender({ enabled: true });
			await Promise.resolve();
		});

		expect(saveReading).toHaveBeenCalledWith(
			expect.objectContaining({ bookUuid: "book-1", status: "reading" }),
			expect.anything(),
		);
	});

	test("clears reading activity when the reader stops being ready", async () => {
		const { rerender } = renderBindingHook(
			({ enabled }) =>
				useReaderSync({ enabled, bookUuid: "book-1", getCharCounts: counts }),
			{ initialProps: { enabled: true } },
		);

		await act(async () => {
			await Promise.resolve();
			clearActivity.mockClear();
			rerender({ enabled: false });
			await Promise.resolve();
		});

		expect(clearActivity).toHaveBeenCalledWith({
			context: { keepalive: true },
		});
	});
});
