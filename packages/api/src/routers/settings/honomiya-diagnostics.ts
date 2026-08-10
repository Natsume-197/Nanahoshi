import { readListenGenerationQueue } from "../../infrastructure/queue/queues/read-listen-generation.queue";
import { resolveHonomiyaCliPath } from "../read-listen/honomiya-process";
import { modalCredentialStore } from "./modal-credentials";
import type { HonomiyaConfig } from "./settings.model";

const VERSION_TIMEOUT_MS = 5_000;

export type HonomiyaDiagnostics = {
	checkedAt: string;
	cli: { available: boolean; version: string | null };
	modal: {
		configured: boolean;
		source: "environment" | "nanahoshi" | "profile" | null;
		managedConfigured: boolean;
	};
	worker: { available: boolean; count: number };
};

async function readCliVersion(cliPath: string): Promise<string | null> {
	const subprocess = Bun.spawn(["bun", cliPath, "--version"], {
		stdout: "pipe",
		stderr: "ignore",
	});
	const timeout = setTimeout(() => subprocess.kill(), VERSION_TIMEOUT_MS);
	try {
		const [exitCode, stdout] = await Promise.all([
			subprocess.exited,
			new Response(subprocess.stdout).text(),
		]);
		if (exitCode !== 0) return null;
		return stdout.trim() || null;
	} finally {
		clearTimeout(timeout);
	}
}

async function inspectCli(
	config: HonomiyaConfig,
): Promise<HonomiyaDiagnostics["cli"]> {
	try {
		const cliPath = await resolveHonomiyaCliPath(
			config.cliPath ?? process.env.HONOMIYA_CLI_PATH,
		);
		const version = await readCliVersion(cliPath);
		return { available: version !== null, version };
	} catch {
		return { available: false, version: null };
	}
}

export async function diagnoseHonomiya(
	config: HonomiyaConfig,
): Promise<HonomiyaDiagnostics> {
	const [cli, modal, workerCount] = await Promise.all([
		inspectCli(config),
		modalCredentialStore.status(),
		readListenGenerationQueue.getWorkersCount().catch(() => 0),
	]);
	return {
		checkedAt: new Date().toISOString(),
		cli,
		modal,
		worker: { available: workerCount > 0, count: workerCount },
	};
}
