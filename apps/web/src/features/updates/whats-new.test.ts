import { describe, expect, test } from "bun:test";
import {
	decideWhatsNew,
	entriesBetween,
	type WhatsNewEntry,
} from "./whats-new";
import en from "./whats-new/en.json";
import es from "./whats-new/es.json";
import ja from "./whats-new/ja.json";

const entry = (version: string): WhatsNewEntry => ({
	version,
	date: "2026-11-24",
	notices: [],
	groups: [{ type: "added", items: [`In ${version}`] }],
});
const catalog = [entry("v1.5.0"), entry("v1.7.0"), entry("v1.6.0")];

describe("decideWhatsNew", () => {
	test("a browser with nothing stored starts silently at this release", () => {
		expect(decideWhatsNew(catalog, null, "v1.7.0")).toEqual({
			show: false,
			marker: "v1.7.0",
		});
	});

	test("shows every release since the last one seen, newest first", () => {
		const decision = decideWhatsNew(catalog, "v1.4.0", "v1.6.0");
		expect(decision.show).toBe(true);
		if (decision.show) {
			expect(decision.marker).toBe("v1.6.0");
			expect(decision.entries.map((e) => e.version)).toEqual([
				"v1.6.0",
				"v1.5.0",
			]);
		}
	});

	test("moves the marker silently past a release without notes", () => {
		expect(decideWhatsNew(catalog, "v1.7.0", "v1.7.1")).toEqual({
			show: false,
			marker: "v1.7.1",
		});
	});

	test("never moves back, and ignores development builds", () => {
		expect(decideWhatsNew(catalog, "v1.7.0", "v1.6.0")).toEqual({
			show: false,
			marker: null,
		});
		expect(decideWhatsNew(catalog, "v1.5.0", "development")).toEqual({
			show: false,
			marker: null,
		});
	});

	test("entriesBetween without a marker lists everything up to the release", () => {
		expect(
			entriesBetween(catalog, null, "v1.6.0").map((e) => e.version),
		).toEqual(["v1.6.0", "v1.5.0"]);
	});
});

describe("bundled notes", () => {
	test("every language has the same releases, notices and items", () => {
		const shape = (entries: WhatsNewEntry[]) =>
			entries.map((e) => ({
				version: e.version,
				date: e.date,
				notices: e.notices.length,
				groups: e.groups.map((g) => [g.type, g.items.length]),
			}));
		expect(shape(es as WhatsNewEntry[])).toEqual(shape(en as WhatsNewEntry[]));
		expect(shape(ja as WhatsNewEntry[])).toEqual(shape(en as WhatsNewEntry[]));
	});
});
