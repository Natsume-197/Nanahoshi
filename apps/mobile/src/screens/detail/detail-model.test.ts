import { describe, expect, mock, test } from "bun:test";

mock.module("expo-localization", () => ({
	getLocales: () => [{ languageCode: "en" }],
}));
mock.module("expo-secure-store", () => ({
	getItem: () => null,
	setItem: () => undefined,
}));

const { currentChapter, headerSolidProgress, primaryAction } = await import(
	"./detail-model"
);

describe("primaryAction", () => {
	test("an unread book just says Read", () => {
		expect(
			primaryAction({ audio: false, progress: 0, playing: false }),
		).toEqual({ label: "Read", detail: null });
	});

	test("a started book shows how far along it is", () => {
		const action = primaryAction({
			audio: false,
			progress: 42,
			playing: false,
		});
		expect(action.label).toBe("Continue reading");
		expect(action.detail).toContain("42");
	});

	test("an unstarted audiobook shows its length", () => {
		expect(
			primaryAction({
				audio: true,
				progress: 0,
				playing: false,
				duration: 5 * 3600 + 5 * 60,
			}).detail,
		).toBe("5h 5m");
	});

	test("a started audiobook shows the time left, not the length", () => {
		const action = primaryAction({
			audio: true,
			progress: 50,
			playing: false,
			duration: 4 * 3600,
			position: 3600,
		});
		expect(action.detail).toContain("3h");
		expect(action.detail).not.toContain("4h");
	});

	test("playing turns the button into pause", () => {
		expect(
			primaryAction({ audio: true, progress: 10, playing: true }).detail,
		).toBeNull();
	});
});

describe("currentChapter", () => {
	const chapters = [
		{ startTime: 0, endTime: 100 },
		{ startTime: 100, endTime: 250 },
	];
	test("finds the chapter the saved position is in", () => {
		expect(currentChapter(chapters, 120)).toBe(1);
	});
	test("nothing is current before listening starts", () => {
		expect(currentChapter(chapters, 0)).toBe(-1);
	});
});

describe("headerSolidProgress", () => {
	const bar = { titleOffset: 500, barBottom: 80 };
	test("stays transparent while the title is still visible below the bar", () => {
		expect(headerSolidProgress({ ...bar, scrollY: 0 })).toBe(0);
		expect(headerSolidProgress({ ...bar, scrollY: 420 })).toBe(0);
	});
	test("fades in while the title slides under the bar", () => {
		const midway = headerSolidProgress({ ...bar, scrollY: 440 });
		expect(midway).toBeGreaterThan(0);
		expect(midway).toBeLessThan(1);
	});
	test("is fully solid once the title is under the bar", () => {
		expect(headerSolidProgress({ ...bar, scrollY: 470 })).toBe(1);
		expect(headerSolidProgress({ ...bar, scrollY: 9000 })).toBe(1);
	});
	test("stays transparent until the hero has been measured", () => {
		expect(
			headerSolidProgress({ titleOffset: null, barBottom: 80, scrollY: 9000 }),
		).toBe(0);
	});
});
