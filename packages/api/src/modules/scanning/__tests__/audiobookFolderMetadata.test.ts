import { expect, test } from "bun:test";
import { extractFolderMetadata } from "../audiobookFolderMetadata";

test("an import-date folder is neither an author, a series nor volume 2022", () => {
	expect(
		extractFolderMetadata("2022-12-22/業物語 [B08VRQHBJC].m4b", true, 26),
	).toEqual({ authorHint: null, seriesHint: null, seriesPositionHint: null });
});

test("file indices do not become series positions", () => {
	expect(
		extractFolderMetadata(
			"本好きの下剋上/[27] 第五部 女神の化身6 [B09DFTVWQX].m4b",
			true,
			3,
		),
	).toEqual({
		authorHint: null,
		seriesHint: "本好きの下剋上",
		seriesPositionHint: null,
	});
	expect(
		extractFolderMetadata("本好きの下剋上/特別編.m4b", true, 3)
			.seriesPositionHint,
	).toBeNull();
});

test("preserves conventional author/series/volume paths and decimal positions", () => {
	expect(
		extractFolderMetadata("Author/Series/Vol. 6.5 - Extra.m4b", true, 2),
	).toEqual({
		authorHint: "Author",
		seriesHint: "Series",
		seriesPositionHint: 6.5,
	});
	expect(
		extractFolderMetadata("Author/Series/第5巻", false, 0).seriesPositionHint,
	).toBe(5);
	expect(
		extractFolderMetadata("Series/死物語 上.m4b", true, 2).seriesPositionHint,
	).toBe(1);
});

test("a labeled volume takes precedence over an import index", () => {
	expect(
		extractFolderMetadata("Series/[19] [１８巻] Title.m4b", true, 2)
			.seriesPositionHint,
	).toBe(18);
	expect(
		extractFolderMetadata("Series/[16] 特別編.m4b", true, 2).seriesPositionHint,
	).toBeNull();
});

test("a collection range is not reduced to its final volume", () => {
	expect(
		extractFolderMetadata("Series/[1-3巻] Collection.m4b", true, 2)
			.seriesPositionHint,
	).toBeNull();
});
