import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { previewFolder } from "../folder-preview";

const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) await fs.rm(root, { recursive: true, force: true });
});

async function makeTree(structure: Record<string, string[]>) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "nanahoshi-preview-"));
	roots.push(root);
	for (const [dir, files] of Object.entries(structure)) {
		await fs.mkdir(path.join(root, dir), { recursive: true });
		for (const file of files)
			await fs.writeFile(path.join(root, dir, file), "x");
	}
	return root;
}

describe("folder preview", () => {
	test("counts ebooks, and audiobooks one per folder", async () => {
		const root = await makeTree({
			novels: ["a.epub", "b.azw3", "notes.txt"],
			"novels/series": ["c.pdf"],
			"audio/Book One": ["01.mp3", "02.mp3", "cover.jpg"],
			"audio/Book Two": ["book.m4b"],
			".hidden": ["secret.epub"],
		});
		expect(await previewFolder(root)).toEqual({
			state: "ok",
			ebooks: 3,
			audiobooks: 2,
			partial: false,
		});
	});

	test("an empty folder is fine, just empty", async () => {
		const root = await makeTree({ empty: [] });
		const preview = await previewFolder(path.join(root, "empty"));
		expect(preview).toMatchObject({ state: "ok", ebooks: 0, audiobooks: 0 });
	});

	test("a missing folder says so instead of counting zero", async () => {
		const preview = await previewFolder("/definitely/not/here");
		expect(preview.state).toBe("missing");
	});

	test("stops at its limits and says the count is partial", async () => {
		const root = await makeTree({
			a: ["1.epub", "2.epub"],
			b: ["3.epub"],
			c: ["4.epub"],
		});
		const preview = await previewFolder(root, { entries: 3, ms: 4000 });
		expect(preview.partial).toBe(true);
	});
});
