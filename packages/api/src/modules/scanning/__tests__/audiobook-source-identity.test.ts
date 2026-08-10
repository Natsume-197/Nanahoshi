import { describe, expect, test } from "bun:test";
import { createAudiobookSourceFingerprint } from "../audiobook-source-identity";

describe("createAudiobookSourceFingerprint", () => {
	const tracks = [
		{ filename: "01-intro.m4a", hash: "hash-a" },
		{ filename: "02-chapter.m4a", hash: "hash-b" },
	];

	test("is stable for input order but changes when logical track order changes", () => {
		const original = createAudiobookSourceFingerprint(tracks);
		const reorderedInput = createAudiobookSourceFingerprint(
			[...tracks].reverse(),
		);
		const renamedTracks = createAudiobookSourceFingerprint([
			{ filename: "02-intro.m4a", hash: "hash-a" },
			{ filename: "01-chapter.m4a", hash: "hash-b" },
		]);

		expect(reorderedInput).toBe(original);
		expect(renamedTracks).not.toBe(original);
	});
});
