import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

test("only the mount lifecycle helper accesses React useEffect", async () => {
	const root = resolve(import.meta.dir, "..");
	const violations: string[] = [];
	for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan(root)) {
		if (
			path === "hooks/use-mount-effect.ts" ||
			path.endsWith(".test.ts") ||
			path.endsWith(".test.tsx")
		)
			continue;
		const source = await readFile(resolve(root, path), "utf8");
		const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
		if (/\buseEffect\b/.test(code)) violations.push(path);
	}
	expect(violations).toEqual([]);
});
