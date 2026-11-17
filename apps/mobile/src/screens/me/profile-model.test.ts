import { describe, expect, test } from "bun:test";
import { membershipOf, monthYear, profileFigures } from "./profile-model";

describe("profileFigures", () => {
	test("books and audiobooks count together", () => {
		expect(
			profileFigures(
				{ completed: 40, reading: 3, want: 12 },
				{ completed: 2, reading: 1, want: 0 },
			),
		).toEqual({ finished: 42, inProgress: 4, wantTo: 12 });
	});

	test("no numbers until every shelf has answered", () => {
		expect(
			profileFigures({ completed: 40, reading: 3, want: 12 }, { completed: 2 }),
		).toBeNull();
	});
});

describe("membershipOf", () => {
	const members = [
		{ userId: "a", role: "member", createdAt: "2026-03-05T10:00:00Z" },
		{ userId: "b", role: "admin,member", createdAt: "2025-11-20T10:00:00Z" },
		{ userId: "c", role: "owner", createdAt: "not a date" },
		{ userId: "d", role: "moderator", createdAt: "2026-01-01T00:00:00Z" },
	];

	test("the highest role wins and the join date comes along", () => {
		expect(membershipOf(members, "b")).toEqual({
			role: "admin",
			joinedAt: new Date("2025-11-20T10:00:00Z"),
		});
		expect(membershipOf(members, "a")?.role).toBe("member");
	});

	test("an unreadable date or an unknown role is left out, not invented", () => {
		expect(membershipOf(members, "c")).toEqual({
			role: "owner",
			joinedAt: null,
		});
		expect(membershipOf(members, "d")?.role).toBeNull();
	});

	test("someone not in the list (or no id yet) has no membership to show", () => {
		expect(membershipOf(members, "z")).toBeNull();
		expect(membershipOf(members, null)).toBeNull();
		expect(membershipOf(undefined, "a")).toBeNull();
	});
});

test("member since reads as a month and year", () => {
	const date = new Date(2026, 10, 5);
	expect(monthYear(date, "en")).toBe("November 2026");
	expect(monthYear(date, "es")).toMatch(/noviembre/);
});
