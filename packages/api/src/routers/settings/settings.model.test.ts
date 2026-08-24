import { describe, expect, test } from "bun:test";
import { HonomiyaConfigSchema } from "./settings.model";

const baseConfig = {
	enabled: true,
	cliPath: null,
	quality: "accurate" as const,
	parallelChunks: 2,
	retries: 2,
	workerConcurrency: 1,
};

describe("HonomiyaConfigSchema", () => {
	test.each(["local", "modal"] as const)(
		"accepts the %s transcription provider",
		(provider) => {
			expect(
				HonomiyaConfigSchema.parse({ ...baseConfig, provider }).provider,
			).toBe(provider);
		},
	);

	test("rejects unknown transcription providers", () => {
		expect(
			HonomiyaConfigSchema.safeParse({ ...baseConfig, provider: "remote" })
				.success,
		).toBe(false);
	});
});
