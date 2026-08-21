import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sectionSource = readFileSync(
	new URL("./read-listen-section.tsx", import.meta.url),
	"utf8",
);

describe("Honomiya generation recovery", () => {
	test("offers an explicit retry after a failed regeneration with a ready artifact", () => {
		expect(sectionSource).toMatch(
			/const canStartGeneration =\s*alignment\.status !== "ready" \|\| hasFailedGeneration;/,
		);
		expect(sectionSource).toContain('? m["read_listen.retry_generation"]()');
	});
});
