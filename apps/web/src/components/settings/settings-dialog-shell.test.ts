import { describe, expect, test } from "bun:test";

describe("theme customizer geometry", () => {
	test("uses one centering transform so the first drag cannot double-shift it", async () => {
		const source = await Bun.file(
			new URL("./settings-dialog-shell.tsx", import.meta.url),
		).text();

		expect(source.match(/md:-translate-x-1\/2/g)).toHaveLength(1);
		expect(source.match(/md:-translate-y-1\/2/g)).toHaveLength(1);
		expect(source).toContain(
			'transform: desktop ? "translate3d(-50%, -50%, 0)"',
		);
	});
});
