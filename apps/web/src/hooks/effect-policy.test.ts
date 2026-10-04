import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repo = resolve(import.meta.dir, "../../../..");
const FRONTEND_ROOTS = [
	"apps/web/src",
	"packages/ui/src",
	"packages/reader/src",
];
const MOUNT_EFFECT = "packages/ui/src/hooks/use-mount-effect.ts";

test("only the mount lifecycle helper accesses React useEffect", async () => {
	const violations: string[] = [];
	for (const root of FRONTEND_ROOTS) {
		for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan(
			resolve(repo, root),
		)) {
			const file = `${root}/${path}`;
			if (
				file === MOUNT_EFFECT ||
				path.endsWith(".test.ts") ||
				path.endsWith(".test.tsx")
			)
				continue;
			const source = await readFile(resolve(repo, file), "utf8");
			const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, "");
			if (/\buseEffect\b/.test(code)) violations.push(file);
		}
	}
	expect(violations).toEqual([]);
});
