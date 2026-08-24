import { describe, expect, test } from "bun:test";
import source from "./honomiya.tsx" with { type: "text" };

describe("Honomiya settings", () => {
	test("offers Local and Modal as persisted transcription providers", () => {
		expect(source).toContain('type Provider = "local" | "modal"');
		expect(source).toContain('<SelectItem value="local">');
		expect(source).toContain('<SelectItem value="modal">');
		expect(source).toContain("provider: configDraft.provider");
	});

	test("shows Modal credentials only when Modal is selected", () => {
		expect(source.match(/configDraft\.provider === "modal"/g)?.length).toBe(2);
	});
});
