import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { createSeriesZipStream } from "./seriesZip";

let directory: string | undefined;

afterEach(async () => {
	if (directory) await rm(directory, { recursive: true, force: true });
	directory = undefined;
});

describe("createSeriesZipStream", () => {
	test("produces a valid archive while skipping a source that disappeared", async () => {
		directory = await mkdtemp(path.join(tmpdir(), "nanahoshi-series-zip-"));
		const presentPath = path.join(directory, "present.epub");
		await writeFile(presentPath, "ebook bytes");

		const archive = new Uint8Array(
			await new Response(
				createSeriesZipStream([
					{ filename: "present.epub", fullPath: presentPath },
					{
						filename: "missing.epub",
						fullPath: path.join(directory, "missing.epub"),
					},
				]),
			).arrayBuffer(),
		);
		const files = unzipSync(archive);

		expect(Object.keys(files)).toEqual(["present.epub"]);
		expect(strFromU8(files["present.epub"] ?? new Uint8Array())).toBe(
			"ebook bytes",
		);
	});
});
