import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { coversDir } from "../../lib/cover-store";
import { parseAzw3, processAzw3 } from "../azw3Processor";
import { minimalAzw3 } from "./fixtures/azw3.fixture";

describe("parseAzw3", () => {
	test("extracts native KF8 metadata, identifiers, subjects, series, and cover", () => {
		const result = parseAzw3(minimalAzw3());

		expect(result.metadata).toEqual({
			title: "The Analytical Engine",
			authors: ["Ada Lovelace", "Charles Babbage"],
			publisher: "Analytical Press",
			description: "A generated fixture, not a published book.",
			publishedDate: "2026-07-14",
			languageCode: "en-US",
			isbn10: null,
			isbn13: "9780306406157",
			asin: "B012345678",
			embeddedUid: "fixture-uid",
			subjects: ["Computing", "History"],
			series: { name: "Engine Papers", position: 2.5 },
		});
		expect(result.cover?.extension).toBe(".png");
		expect(result.cover?.bytes.subarray(0, 8)).toEqual(
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		);
		expect(result.rawExth[100]).toEqual(["Ada Lovelace", "Charles Babbage"]);
	});

	test("does not persist an embedded cover with an unknown signature as .bin", async () => {
		const fixtureDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "nh-azw3-cover-"),
		);
		const filePath = path.join(fixtureDir, "unknown-cover.azw3");
		const uuid = `unknown-cover-${crypto.randomUUID()}`;
		const binPath = path.join(coversDir, `${uuid}.bin`);
		try {
			await fs.writeFile(
				filePath,
				minimalAzw3({ cover: Buffer.from("not-an-image") }),
			);

			const metadata = await processAzw3(filePath, uuid);

			expect(metadata.cover).toBeUndefined();
			await expect(fs.access(binPath)).rejects.toThrow();
		} finally {
			await fs.rm(fixtureDir, { recursive: true, force: true });
			await fs.rm(binPath, { force: true });
		}
	});

	test("rejects a legacy MOBI container even when renamed to .azw3", () => {
		expect(() => parseAzw3(minimalAzw3({ version: 6 }))).toThrow(
			"not a native AZW3/KF8 file",
		);
	});

	test("falls back to the MOBI header language when EXTH omits it", () => {
		const result = parseAzw3(minimalAzw3({ includeLanguageExth: false }));
		expect(result.metadata.languageCode).toBe("en");
	});
});
