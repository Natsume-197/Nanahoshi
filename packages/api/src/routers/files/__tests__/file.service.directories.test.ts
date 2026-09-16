import { afterAll, describe, expect, mock, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { GetDirectoriesInput } from "../file.model";

// file.service reaches the DB only through repository singletons; mocking the
// Drizzle client as {} guarantees any unpatched repository call blows up with
// a TypeError instead of silently hitting a database. getDirectories never
// touches the DB — the mocks below only satisfy the import chain
// (helpers/urlSigner reads the validated env at import time).
mock.module("@nanahoshi/env/server", () => ({
	env: {
		DOWNLOAD_SECRET: "00000000-0000-0000-0000-000000000001",
		SERVER_URL: "http://localhost:3000",
	},
}));
mock.module("@nanahoshi/db", () => ({ db: {} }));

const { getDirectories } = await import("../file.service");

const roots: string[] = [];
afterAll(async () => {
	for (const root of roots) {
		await fs.rm(root, { recursive: true, force: true });
	}
});

async function makeTree(structure: Record<string, string[]>) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "nanahoshi-dirs-"));
	roots.push(root);
	for (const [dir, files] of Object.entries(structure)) {
		await fs.mkdir(path.join(root, dir), { recursive: true });
		for (const file of files) {
			await fs.writeFile(path.join(root, dir, file), "x");
		}
	}
	return root;
}

describe("getDirectories", () => {
	test("lists subdirectories only, with joined paths", async () => {
		const root = await makeTree({ alpha: ["book.epub"], beta: [] });
		const dirs = await getDirectories(root);
		expect(dirs).toHaveLength(2);
		expect(dirs.map((d) => d.name).sort()).toEqual(["alpha", "beta"]);
		for (const d of dirs) {
			expect(d.path).toBe(path.join(root, d.name));
			expect(d.hasChildren).toBe(true);
		}
	});

	test("a trailing slash is normalized, not concatenated", async () => {
		const root = await makeTree({ alpha: [] });
		const dirs = await getDirectories(`${root}/`);
		expect(dirs).toEqual([
			{ name: "alpha", path: path.join(root, "alpha"), hasChildren: true },
		]);
	});

	test("nonexistent paths resolve to [] instead of throwing", async () => {
		await expect(
			getDirectories(path.join(os.tmpdir(), "nanahoshi-no-such-dir")),
		).resolves.toEqual([]);
	});

	test("empty location returns the platform root sentinel", async () => {
		const dirs = await getDirectories("");
		if (process.platform === "win32") {
			expect(Array.isArray(dirs)).toBe(true);
		} else {
			expect(dirs).toEqual([{ name: "/", path: "/", hasChildren: true }]);
		}
	});

	test("listings are capped", async () => {
		const root = await fs.mkdtemp(path.join(os.tmpdir(), "nanahoshi-many-"));
		roots.push(root);
		for (let i = 0; i < 1050; i++) {
			await fs.mkdir(path.join(root, `dir-${i}`));
		}
		const dirs = await getDirectories(root);
		expect(dirs).toHaveLength(1000);
	});
});

describe("GetDirectoriesInput", () => {
	test("accepts absolute paths and the empty root sentinel", () => {
		expect(GetDirectoriesInput.parse({ location: "/books" }).location).toBe(
			"/books",
		);
		expect(GetDirectoriesInput.parse({ location: "" }).location).toBe("");
	});

	test("rejects relative paths, NUL bytes, and overlong input", () => {
		expect(() =>
			GetDirectoriesInput.parse({ location: "relative/path" }),
		).toThrow();
		expect(() =>
			GetDirectoriesInput.parse({ location: "/books/\0evil" }),
		).toThrow();
		expect(() =>
			GetDirectoriesInput.parse({ location: `/${"a".repeat(1024)}` }),
		).toThrow();
	});
});
