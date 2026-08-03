import { describe, expect, it } from "bun:test";
import { resolvePlayerShortcut } from "../player-shortcuts";

const collapsed = { isExpanded: false };
const expanded = { isExpanded: true };

describe("resolvePlayerShortcut", () => {
	it("maps the transport keys", () => {
		expect(resolvePlayerShortcut({ key: " " }, collapsed)).toBe("toggle-play");
		expect(resolvePlayerShortcut({ key: "k" }, collapsed)).toBe("toggle-play");
		expect(resolvePlayerShortcut({ key: "ArrowLeft" }, collapsed)).toBe(
			"seek-back",
		);
		expect(resolvePlayerShortcut({ key: "ArrowRight" }, collapsed)).toBe(
			"seek-forward",
		);
		expect(resolvePlayerShortcut({ key: "m" }, collapsed)).toBe("toggle-mute");
	});

	it("uses shift for chapter jumps", () => {
		expect(
			resolvePlayerShortcut({ key: "ArrowLeft", shiftKey: true }, collapsed),
		).toBe("prev-chapter");
		expect(
			resolvePlayerShortcut({ key: "ArrowRight", shiftKey: true }, collapsed),
		).toBe("next-chapter");
	});

	it("only collapses with Escape while expanded", () => {
		expect(resolvePlayerShortcut({ key: "Escape" }, expanded)).toBe("collapse");
		expect(resolvePlayerShortcut({ key: "Escape" }, collapsed)).toBeNull();
	});

	it("ignores browser and OS modifiers", () => {
		expect(
			resolvePlayerShortcut({ key: " ", ctrlKey: true }, collapsed),
		).toBeNull();
		expect(
			resolvePlayerShortcut({ key: "k", metaKey: true }, collapsed),
		).toBeNull();
		expect(
			resolvePlayerShortcut({ key: "ArrowLeft", altKey: true }, collapsed),
		).toBeNull();
	});

	it("stays out of the way while typing", () => {
		const target = { tagName: "INPUT" };
		expect(resolvePlayerShortcut({ key: " ", target }, collapsed)).toBeNull();
		expect(
			resolvePlayerShortcut(
				{ key: " ", target: { tagName: "DIV", isContentEditable: true } },
				collapsed,
			),
		).toBeNull();
	});

	it("lets a focused control keep its own keys", () => {
		// Space on a focused button must press it, not toggle playback.
		expect(
			resolvePlayerShortcut(
				{ key: " ", target: { tagName: "BUTTON" } },
				collapsed,
			),
		).toBeNull();
		expect(
			resolvePlayerShortcut(
				{ key: "ArrowRight", target: { tagName: "A" } },
				collapsed,
			),
		).toBeNull();
	});

	it("stays out of the way inside a menu, dialog or slider", () => {
		const target = {
			tagName: "DIV",
			closest: (selector: string) => (selector.includes("dialog") ? {} : null),
		};
		expect(
			resolvePlayerShortcut({ key: "ArrowDown", target }, collapsed),
		).toBeNull();
	});

	it("fires on plain page content", () => {
		const target = { tagName: "DIV", closest: () => null };
		expect(resolvePlayerShortcut({ key: " ", target }, collapsed)).toBe(
			"toggle-play",
		);
	});

	it("returns null for unbound keys", () => {
		expect(resolvePlayerShortcut({ key: "q" }, collapsed)).toBeNull();
	});
});
