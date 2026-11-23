import { describe, expect, test } from "bun:test";
import {
	type HonomiyaModel,
	HonomiyaModelManager,
	honomiyaModelDirectory,
	parseHonomiyaModelList,
	resolveCtcEngine,
} from "../honomiya-models";

const LIST_OUTPUT = [
	"quartznet15x5-ja\tja\t91 MiB\tinstalled\tint8 r1-int8",
	"quartznet15x5-es\tes\t73 MiB\tnot installed",
	"quartznet15x5-en\ten\t73 MiB\tnot installed",
	"Model directory: /data/honomiya/models",
	"",
].join("\n");

const models: HonomiyaModel[] = parseHonomiyaModelList(LIST_OUTPUT);

function stream(text: string): ReadableStream<Uint8Array> {
	return new Response(text).body as ReadableStream<Uint8Array>;
}

function fakeSpawn(
	results: Record<
		string,
		{ exitCode: number; stdout?: string; stderr?: string }
	>,
) {
	const calls: string[][] = [];
	const spawn = (command: string[]) => {
		calls.push(command);
		const result = results[command[3] as string] ?? { exitCode: 1 };
		return {
			exited: Promise.resolve(result.exitCode),
			stdout: stream(result.stdout ?? ""),
			stderr: stream(result.stderr ?? ""),
			kill() {},
		};
	};
	return { spawn, calls };
}

async function settle(
	manager: HonomiyaModelManager,
	id: string,
): Promise<{ pulling: boolean; error: string | null } | undefined> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const status = (await manager.status("/cli.js")).find((m) => m.id === id);
		if (!status?.pulling) return status;
		await Bun.sleep(1);
	}
	throw new Error("pull never settled");
}

describe("Honomiya CTC models", () => {
	test("parses the models list and skips the trailing directory line", () => {
		expect(models).toEqual([
			{
				id: "quartznet15x5-ja",
				languages: ["ja"],
				sizeMiB: 91,
				installed: true,
			},
			{
				id: "quartznet15x5-es",
				languages: ["es"],
				sizeMiB: 73,
				installed: false,
			},
			{
				id: "quartznet15x5-en",
				languages: ["en"],
				sizeMiB: 73,
				installed: false,
			},
		]);
	});

	test("keeps models inside the persistent data directory by default", () => {
		expect(honomiyaModelDirectory({}, "/app/apps/server")).toBe(
			"/app/apps/server/data/honomiya/models",
		);
		expect(honomiyaModelDirectory({ HONOMIYA_MODEL_DIR: "/models" })).toBe(
			"/models",
		);
	});

	test("auto uses CTC only when the ebook's language has an installed model", () => {
		expect(
			resolveCtcEngine({ preference: "auto", language: "ja-JP", models }),
		).toEqual({ model: "quartznet15x5-ja" });
		expect(
			resolveCtcEngine({ preference: "auto", language: "jpn", models }),
		).toEqual({ model: "quartznet15x5-ja" });
		expect(
			resolveCtcEngine({ preference: "auto", language: "es", models }),
		).toBeNull();
		expect(
			resolveCtcEngine({ preference: "auto", language: null, models }),
		).toBeNull();
	});

	test("whisper never uses CTC, even with a matching model", () => {
		expect(
			resolveCtcEngine({ preference: "whisper", language: "ja", models }),
		).toBeNull();
	});

	test("forced CTC lets Honomiya read an unknown language from the ebook", () => {
		expect(
			resolveCtcEngine({ preference: "ctc", language: null, models }),
		).toEqual({ model: null });
	});

	test("forced CTC fails before queueing when no model fits", () => {
		expect(() =>
			resolveCtcEngine({ preference: "ctc", language: "en", models }),
		).toThrow('No Honomiya CTC model is installed for language "en"');
		expect(() =>
			resolveCtcEngine({ preference: "ctc", language: null, models: [] }),
		).toThrow("No Honomiya CTC model is installed");
	});

	test("a finished pull clears its state; a failed one keeps the last stderr line", async () => {
		const ok = fakeSpawn({
			list: { exitCode: 0, stdout: LIST_OUTPUT },
			pull: { exitCode: 0 },
		});
		const okManager = new HonomiyaModelManager(ok.spawn, () => "/models");
		await okManager.pull("/cli.js", "quartznet15x5-es");
		expect(ok.calls).toContainEqual([
			"bun",
			"/cli.js",
			"models",
			"pull",
			"quartznet15x5-es",
			"--model-dir",
			"/models",
		]);
		expect(await settle(okManager, "quartznet15x5-es")).toEqual(
			expect.objectContaining({ pulling: false, error: null }),
		);

		const failing = fakeSpawn({
			list: { exitCode: 0, stdout: LIST_OUTPUT },
			pull: {
				exitCode: 1,
				stderr: "Downloading…\nCould not manage models: SHA-256 mismatch\n",
			},
		});
		const failingManager = new HonomiyaModelManager(
			failing.spawn,
			() => "/models",
		);
		await failingManager.pull("/cli.js", "quartznet15x5-en");
		expect(await settle(failingManager, "quartznet15x5-en")).toEqual(
			expect.objectContaining({
				pulling: false,
				error: "Could not manage models: SHA-256 mismatch",
			}),
		);
	});

	test("refuses to pull a model the CLI does not know", async () => {
		const fake = fakeSpawn({ list: { exitCode: 0, stdout: LIST_OUTPUT } });
		const manager = new HonomiyaModelManager(fake.spawn, () => "/models");
		await expect(manager.pull("/cli.js", "quartznet15x5-fr")).rejects.toThrow(
			"Unknown Honomiya model",
		);
		expect(fake.calls.some((command) => command[3] === "pull")).toBe(false);
	});
});
