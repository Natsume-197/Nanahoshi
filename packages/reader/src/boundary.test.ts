import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

// The web app and the mobile WebView both embed the reader; it depends on
// workspace packages only, never on an app.
test("the reader imports nothing from an app", async () => {
	const violations: string[] = [];
	for await (const path of new Bun.Glob("**/*.{ts,tsx}").scan(
		import.meta.dir,
	)) {
		if (path.includes("paraglide/")) continue;
		const source = await readFile(`${import.meta.dir}/${path}`, "utf8");
		for (const [, specifier] of source.matchAll(
			/(?:from|import\(|mock\.module\()\s*["']([^"']+)["']/g,
		)) {
			if (!specifier) continue;
			const escapes =
				specifier.startsWith(".") &&
				relative(
					import.meta.dir,
					resolve(dirname(`${import.meta.dir}/${path}`), specifier),
				).startsWith("..");
			if (specifier.startsWith("@/") || escapes)
				violations.push(`${path}: ${specifier}`);
		}
	}
	expect(violations).toEqual([]);
});
