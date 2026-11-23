import path from "node:path";
import { ConflictError } from "../../errors";

const LIST_TIMEOUT_MS = 10_000;
const MAX_ERROR_LENGTH = 500;
const MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

/** Engine preference stored in the instance Honomiya settings. */
export type HonomiyaEnginePreference = "auto" | "ctc" | "whisper";

export type HonomiyaModel = {
	id: string;
	languages: string[];
	sizeMiB: number;
	installed: boolean;
};

export type HonomiyaModelStatus = HonomiyaModel & {
	pulling: boolean;
	error: string | null;
};

/** `model` is null when the ebook's language is unknown: Honomiya then reads
 * it from the ebook itself. */
export type CtcEngineChoice = { model: string | null };

// Our metadata sometimes stores ISO 639-2 codes; Honomiya models use 639-1.
const ISO_639_2_TO_1: Record<string, string> = {
	jpn: "ja",
	spa: "es",
	eng: "en",
};

export function honomiyaModelDirectory(
	environment: Record<string, string | undefined> = process.env,
	cwd = process.cwd(),
): string {
	return (
		environment.HONOMIYA_MODEL_DIR ||
		path.resolve(cwd, "data", "honomiya", "models")
	);
}

/** Parses `honomiya models list`: `id\tlanguages\tN MiB\tinstalled|not installed[\tint8 …]`. */
export function parseHonomiyaModelList(stdout: string): HonomiyaModel[] {
	const models: HonomiyaModel[] = [];
	for (const line of stdout.split("\n")) {
		const [id, languages, size, status] = line.trim().split("\t");
		if (!id || !languages || !size || !status) continue;
		if (!MODEL_ID_PATTERN.test(id)) continue;
		models.push({
			id,
			languages: languages.split(",").filter(Boolean),
			sizeMiB: Number.parseInt(size, 10) || 0,
			installed: status === "installed",
		});
	}
	return models;
}

function primaryLanguage(language: string | null | undefined): string | null {
	const primary = language?.trim().toLowerCase().split(/[-_]/u)[0];
	if (!primary) return null;
	return ISO_639_2_TO_1[primary] ?? primary;
}

export function resolveCtcEngine(input: {
	preference: HonomiyaEnginePreference;
	language: string | null | undefined;
	models: HonomiyaModel[];
}): CtcEngineChoice | null {
	if (input.preference === "whisper") return null;
	const installed = input.models.filter((model) => model.installed);
	const language = primaryLanguage(input.language);
	const match = language
		? installed.find((model) => model.languages.includes(language))
		: undefined;
	if (match) return { model: match.id };
	if (input.preference === "auto") return null;
	if (!language && installed.length > 0) return { model: null };
	throw new ConflictError(
		language
			? `No Honomiya CTC model is installed for language "${language}"`
			: "No Honomiya CTC model is installed",
	);
}

type Spawn = (
	command: string[],
	options: { stdout: "pipe"; stderr: "pipe" },
) => {
	exited: Promise<number>;
	stdout: ReadableStream<Uint8Array>;
	stderr: ReadableStream<Uint8Array>;
	kill(): void;
};

export class HonomiyaModelManager {
	private readonly pulls = new Map<string, { error: string | null }>();
	private readonly active = new Set<string>();

	constructor(
		private readonly spawn: Spawn = (command, options) =>
			Bun.spawn(command, options),
		private readonly modelDir: () => string = () => honomiyaModelDirectory(),
	) {}

	async list(cliPath: string): Promise<HonomiyaModel[]> {
		const subprocess = this.spawn(
			["bun", cliPath, "models", "list", "--model-dir", this.modelDir()],
			{ stdout: "pipe", stderr: "pipe" },
		);
		const timeout = setTimeout(() => subprocess.kill(), LIST_TIMEOUT_MS);
		try {
			const [exitCode, stdout, stderr] = await Promise.all([
				subprocess.exited,
				new Response(subprocess.stdout).text(),
				new Response(subprocess.stderr).text(),
			]);
			if (exitCode !== 0) {
				throw new Error(
					stderr.trim() || `Honomiya models list exited with ${exitCode}`,
				);
			}
			return parseHonomiyaModelList(stdout);
		} finally {
			clearTimeout(timeout);
		}
	}

	async status(cliPath: string): Promise<HonomiyaModelStatus[]> {
		const models = await this.list(cliPath);
		return models.map((model) => ({
			...model,
			pulling: this.active.has(model.id),
			error: this.pulls.get(model.id)?.error ?? null,
		}));
	}

	/** Starts a download in the background; `status` reports its outcome. */
	async pull(cliPath: string, modelId: string): Promise<void> {
		const models = await this.list(cliPath);
		if (!models.some((model) => model.id === modelId)) {
			throw new ConflictError(`Unknown Honomiya model: ${modelId}`);
		}
		if (this.active.has(modelId)) return;
		this.active.add(modelId);
		this.pulls.set(modelId, { error: null });
		const subprocess = this.spawn(
			[
				"bun",
				cliPath,
				"models",
				"pull",
				modelId,
				"--model-dir",
				this.modelDir(),
			],
			{ stdout: "pipe", stderr: "pipe" },
		);
		void Promise.all([
			subprocess.exited,
			new Response(subprocess.stdout).text(),
			new Response(subprocess.stderr).text(),
		])
			.then(([exitCode, , stderr]) => {
				if (exitCode === 0) {
					this.pulls.delete(modelId);
					return;
				}
				const message =
					stderr.trim().split("\n").at(-1) ||
					`Honomiya models pull exited with ${exitCode}`;
				this.pulls.set(modelId, {
					error: message.slice(0, MAX_ERROR_LENGTH),
				});
			})
			.catch((error: unknown) => {
				this.pulls.set(modelId, {
					error: (error instanceof Error ? error.message : String(error)).slice(
						0,
						MAX_ERROR_LENGTH,
					),
				});
			})
			.finally(() => this.active.delete(modelId));
	}
}

export const honomiyaModelManager = new HonomiyaModelManager();
