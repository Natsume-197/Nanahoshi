import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	deleteBookSource,
	UnsafeBookSourceError,
} from "../book-source-deletion";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "nanahoshi-delete-"),
	);
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => fs.rm(directory, { recursive: true, force: true })),
	);
});

describe("deleteBookSource", () => {
	test("deletes a regular ebook file inside the library root", async () => {
		const root = await temporaryDirectory();
		const bookPath = path.join(root, "novels", "book.epub");
		await fs.mkdir(path.dirname(bookPath), { recursive: true });
		await fs.writeFile(bookPath, "ebook");

		const result = await deleteBookSource({
			libraryRoot: root,
			sourcePaths: [bookPath],
			pruneEmptyDirectories: false,
		});

		expect(result).toEqual({
			deletedPaths: [bookPath],
			sourceWasMissing: false,
		});
		await expect(fs.access(bookPath)).rejects.toMatchObject({ code: "ENOENT" });
		await expect(fs.access(path.dirname(bookPath))).resolves.toBeNull();
	});

	test("rejects a path outside the library before deleting any source", async () => {
		const parent = await temporaryDirectory();
		const root = path.join(parent, "library");
		const inside = path.join(root, "inside.epub");
		const outside = path.join(parent, "outside.epub");
		await fs.mkdir(root);
		await fs.writeFile(inside, "inside");
		await fs.writeFile(outside, "outside");

		await expect(
			deleteBookSource({
				libraryRoot: root,
				sourcePaths: [inside, outside],
				pruneEmptyDirectories: false,
			}),
		).rejects.toBeInstanceOf(UnsafeBookSourceError);
		await expect(fs.readFile(inside, "utf8")).resolves.toBe("inside");
		await expect(fs.readFile(outside, "utf8")).resolves.toBe("outside");
	});

	test("rejects symbolic links even when their target exists", async () => {
		const parent = await temporaryDirectory();
		const root = path.join(parent, "library");
		const outside = path.join(parent, "outside.epub");
		const link = path.join(root, "linked.epub");
		await fs.mkdir(root);
		await fs.writeFile(outside, "outside");
		await fs.symlink(outside, link);

		await expect(
			deleteBookSource({
				libraryRoot: root,
				sourcePaths: [link],
				pruneEmptyDirectories: false,
			}),
		).rejects.toBeInstanceOf(UnsafeBookSourceError);
		await expect(fs.readFile(outside, "utf8")).resolves.toBe("outside");
	});

	test("reports an already missing source without failing", async () => {
		const root = await temporaryDirectory();
		const missing = path.join(root, "missing.epub");

		const result = await deleteBookSource({
			libraryRoot: root,
			sourcePaths: [missing],
			pruneEmptyDirectories: false,
		});

		expect(result).toEqual({ deletedPaths: [], sourceWasMissing: true });
	});

	test("deletes audiobook files and only prunes directories left empty", async () => {
		const root = await temporaryDirectory();
		const bookDirectory = path.join(root, "Author", "Book");
		const discDirectory = path.join(bookDirectory, "Disc 1");
		const firstTrack = path.join(discDirectory, "01.mp3");
		const secondTrack = path.join(bookDirectory, "02.mp3");
		const sidecar = path.join(bookDirectory, "cover.jpg");
		await fs.mkdir(discDirectory, { recursive: true });
		await Promise.all([
			fs.writeFile(firstTrack, "one"),
			fs.writeFile(secondTrack, "two"),
			fs.writeFile(sidecar, "cover"),
		]);

		const result = await deleteBookSource({
			libraryRoot: root,
			sourcePaths: [firstTrack, secondTrack],
			pruneEmptyDirectories: true,
		});

		expect(result.deletedPaths).toEqual([firstTrack, secondTrack]);
		await expect(fs.access(discDirectory)).rejects.toMatchObject({
			code: "ENOENT",
		});
		await expect(fs.readFile(sidecar, "utf8")).resolves.toBe("cover");
		await expect(fs.access(bookDirectory)).resolves.toBeNull();
	});
});
