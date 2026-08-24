import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	discoverTimedTextCandidates,
	resolveTimedTextSelection,
} from "../timed-text-candidates";

describe("read-listen timed-text candidates", () => {
	test("discovers and safely resolves SRT files beside each audio track", async () => {
		const directory = await mkdtemp(path.join(tmpdir(), "nanahoshi-srt-"));
		try {
			const audioPath = path.join(directory, "book.m4b");
			await Promise.all([
				writeFile(audioPath, "audio"),
				writeFile(path.join(directory, "book.srt"), "subtitle"),
				writeFile(path.join(directory, "notes.txt"), "ignore"),
			]);
			const tracks = await discoverTimedTextCandidates([audioPath]);
			expect(tracks).toEqual([
				{
					audioFileIndex: 0,
					audioFilename: "book.m4b",
					candidates: ["book.srt"],
				},
			]);
			expect(
				await resolveTimedTextSelection([audioPath], ["book.srt"]),
			).toEqual([path.join(directory, "book.srt")]);
			await expect(
				resolveTimedTextSelection([audioPath], ["../outside.srt"]),
			).rejects.toThrow("Invalid timed-text filename");
		} finally {
			await rm(directory, { recursive: true, force: true });
		}
	});
});
