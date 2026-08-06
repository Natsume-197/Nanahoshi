import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import {
	MANUAL_PRESENCE_STATUSES,
	resolvePresenceStatus,
	STATUS_META,
	StatusDot,
	withPresenceStatus,
} from "../presence-status";

// No mock.module here on purpose: presence-status.tsx deliberately imports no
// orpc singleton, so it loads for real. Mocking "@/utils/orpc" would leak into
// every other file in the same `bun test` process.

afterEach(cleanup);

describe("STATUS_META", () => {
	// The desktop menu, the mobile drawer and the navbar avatar dot all index
	// STATUS_META by status, so a new status without an entry would blow up in
	// three places at once.
	it("covers every manual status", () => {
		for (const status of MANUAL_PRESENCE_STATUSES) {
			expect(STATUS_META[status]).toBeDefined();
			expect(STATUS_META[status].label()).toBeTruthy();
			expect(STATUS_META[status].dot).toBeTruthy();
		}
	});

	it("shows invisible as offline to others", () => {
		expect(STATUS_META.invisible.dot).not.toBe(STATUS_META.online.dot);
	});
});

describe("resolvePresenceStatus", () => {
	it("passes through a known status", () => {
		expect(resolvePresenceStatus({ presenceStatus: "away" })).toBe("away");
		expect(resolvePresenceStatus({ presenceStatus: "invisible" })).toBe(
			"invisible",
		);
	});

	it("defaults to online while the profile is still loading", () => {
		expect(resolvePresenceStatus(undefined)).toBe("online");
		expect(resolvePresenceStatus(null)).toBe("online");
	});

	it("defaults to online for a missing or unrecognised status", () => {
		expect(resolvePresenceStatus({})).toBe("online");
		expect(resolvePresenceStatus({ presenceStatus: null })).toBe("online");
		// Guards the STATUS_META lookups above: a status this client doesn't know
		// must not index to undefined and crash the render.
		expect(resolvePresenceStatus({ presenceStatus: "reading" })).toBe("online");
	});

	it("only ever returns a status STATUS_META can render", () => {
		for (const value of ["away", "bogus", null, undefined, ""]) {
			const status = resolvePresenceStatus({ presenceStatus: value });
			expect(STATUS_META[status]).toBeDefined();
		}
	});
});

describe("withPresenceStatus", () => {
	it("swaps the status and keeps the rest of the profile", () => {
		const profile = { name: "Yui", image: "a.avif", presenceStatus: "online" };

		expect(withPresenceStatus(profile, "away")).toEqual({
			name: "Yui",
			image: "a.avif",
			presenceStatus: "away",
		});
	});

	it("does not mutate the cached profile", () => {
		const profile = { presenceStatus: "online" };
		withPresenceStatus(profile, "invisible");

		expect(profile.presenceStatus).toBe("online");
	});

	it("leaves an unloaded cache entry alone", () => {
		// Writing a half-built profile here would replace the in-flight fetch with
		// an object that has a status and nothing else.
		expect(withPresenceStatus(undefined, "away")).toBeUndefined();
	});
});

describe("StatusDot", () => {
	it("renders the color for the given status", () => {
		const { container } = render(<StatusDot status="away" />);
		const dot = container.firstElementChild;

		expect(dot?.className).toContain(STATUS_META.away.dot);
	});

	it("merges a caller's className", () => {
		const { container } = render(
			<StatusDot status="online" className="ms-1" />,
		);

		expect(container.firstElementChild?.className).toContain("ms-1");
	});
});
