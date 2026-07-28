import "@/test-utils/setup-dom";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useActivityRailIsSheet, useIsMobile } from "../use-mobile";

type FakeMql = {
	media: string;
	matches: boolean;
	listeners: Set<() => void>;
	addEventListener: (type: string, listener: () => void) => void;
	removeEventListener: (type: string, listener: () => void) => void;
};

let queries: FakeMql[] = [];

/** Flip a media query's result and notify, the way a real resize would. */
function setMatches(media: string, matches: boolean) {
	for (const mql of queries.filter((q) => q.media === media)) {
		mql.matches = matches;
		for (const listener of [...mql.listeners]) listener();
	}
}

beforeEach(() => {
	queries = [];
	window.matchMedia = ((media: string) => {
		const mql: FakeMql = {
			media,
			matches: false,
			listeners: new Set(),
			addEventListener: (_type, listener) => {
				mql.listeners.add(listener);
			},
			removeEventListener: (_type, listener) => {
				mql.listeners.delete(listener);
			},
		};
		queries.push(mql);
		return mql;
	}) as unknown as typeof window.matchMedia;
});

afterEach(() => {
	cleanup();
});

describe("shell breakpoint hooks", () => {
	it("collapses the members rail a full breakpoint before the sidebar", () => {
		renderHook(() => useIsMobile());
		renderHook(() => useActivityRailIsSheet());

		const media = queries.map((q) => q.media);
		expect(media).toEqual(["(max-width: 767px)", "(max-width: 1023px)"]);
		// The regression this guards: both collapses sharing one device preset,
		// which put an inline 14rem rail beside a 17rem sidebar at 768px.
		expect(new Set(media).size).toBe(2);
	});

	it("reports the rail as a sheet between the two thresholds", () => {
		const mobile = renderHook(() => useIsMobile());
		const railIsSheet = renderHook(() => useActivityRailIsSheet());

		// 900px: past the sidebar's threshold, still short of the rail's.
		act(() => {
			setMatches("(max-width: 1023px)", true);
		});

		expect(mobile.result.current).toBe(false);
		expect(railIsSheet.result.current).toBe(true);
	});

	it("tracks changes in both directions", () => {
		const { result } = renderHook(() => useIsMobile());
		expect(result.current).toBe(false);

		act(() => {
			setMatches("(max-width: 767px)", true);
		});
		expect(result.current).toBe(true);

		act(() => {
			setMatches("(max-width: 767px)", false);
		});
		expect(result.current).toBe(false);
	});

	it("unsubscribes on unmount", () => {
		const { unmount } = renderHook(() => useIsMobile());
		expect(queries[0]?.listeners.size).toBe(1);

		unmount();
		expect(queries[0]?.listeners.size).toBe(0);
	});
});
