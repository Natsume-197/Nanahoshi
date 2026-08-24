import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import path from "node:path";
import {
	cleanupStagedTimedText,
	stageTimedTextUploads,
	validateAlignmentUpload,
} from "../uploaded-alignment-input";

const pairUuid = "11111111-1111-4111-8111-111111111111";

afterEach(async () => {
	await fs
		.rm(path.resolve("data", "alignments", "inputs", pairUuid), {
			recursive: true,
			force: true,
		})
		.catch(() => {});
});

describe("uploaded alignment inputs", () => {
	test("stages one isolated UTF-8 SRT per track and cleans it up", async () => {
		const staged = await stageTimedTextUploads(pairUuid, 2, [
			{ filename: "chapter 1.srt", bytes: new TextEncoder().encode("cue 1") },
			{ filename: "chapter 2.srt", bytes: new TextEncoder().encode("cue 2") },
		]);

		expect(staged.map((value) => path.basename(value))).toEqual([
			"chapter 1.srt",
			"chapter 2.srt",
		]);
		expect(
			await Promise.all(staged.map((value) => Bun.file(value).exists())),
		).toEqual([true, true]);

		await cleanupStagedTimedText(staged);
		expect(
			await Promise.all(staged.map((value) => Bun.file(value).exists())),
		).toEqual([false, false]);
	});

	test("rejects incomplete, traversing, or invalid UTF-8 SRT selections", async () => {
		await expect(
			stageTimedTextUploads("../pair", 1, [
				{ filename: "cue.srt", bytes: new TextEncoder().encode("cue") },
			]),
		).rejects.toThrow("pair identifier");
		await expect(
			stageTimedTextUploads(pairUuid, 2, [
				{ filename: "only.srt", bytes: new TextEncoder().encode("cue") },
			]),
		).rejects.toThrow("exactly one SRT");
		await expect(
			stageTimedTextUploads(pairUuid, 1, [
				{ filename: "../escape.srt", bytes: new TextEncoder().encode("cue") },
			]),
		).rejects.toThrow("Choose an SRT");
		await expect(
			stageTimedTextUploads(pairUuid, 1, [
				{ filename: "bad.srt", bytes: Uint8Array.from([0xff]) },
			]),
		).rejects.toThrow("UTF-8");
	});

	test("accepts only explicit Honomiya alignment artifacts", () => {
		expect(() =>
			validateAlignmentUpload({
				filename: "book.honomiya.alignment.json",
				bytes: new TextEncoder().encode("{}"),
			}),
		).not.toThrow();
		expect(() =>
			validateAlignmentUpload({
				filename: "book.json",
				bytes: new TextEncoder().encode("{}"),
			}),
		).toThrow(".honomiya.alignment.json");
	});
});
