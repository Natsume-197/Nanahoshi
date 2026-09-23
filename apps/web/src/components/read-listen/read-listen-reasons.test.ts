import { describe, expect, it } from "bun:test";
import { m } from "@/paraglide/messages";
import { languageName, matchReasonLabels } from "./read-listen-reasons";

describe("matchReasonLabels", () => {
	it("names every title comparison that matched exactly the same way", () => {
		expect(
			matchReasonLabels(["title.exact", "filename_to_title.exact"]),
		).toEqual([m["read_listen.reason_title_exact"]()]);
	});

	it("keeps the matcher's order and drops codes it doesn't know", () => {
		expect(
			matchReasonLabels(["author.match", "volume.match", "future.reason"]),
		).toEqual([
			m["read_listen.reason_author"](),
			m["read_listen.reason_volume"](),
		]);
	});
});

describe("languageName", () => {
	it("reads a spelled-out name and a code as the same language", () => {
		expect(languageName("japanese", "es")).toBe(languageName("ja", "es"));
		expect(languageName("ja", "en")).toBe("Japanese");
	});

	it("passes through values it can't interpret", () => {
		expect(languageName("klingon-ish", "en")).toBe("klingon-ish");
		expect(languageName(null, "en")).toBeNull();
	});
});
