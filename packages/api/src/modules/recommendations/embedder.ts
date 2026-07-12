import path from "node:path";
import { logger } from "../../lib/logger";
import { settingsRepository } from "../../routers/settings/settings.repository";

const log = logger.child({ component: "recommendations-embedder" });

export const EMBEDDING_MODEL = "Xenova/multilingual-e5-small";
// bump to force capability re-probe (model/backend/package changes)
export const EMBEDDER_VERSION = 1;
const CAPABILITY_KEY = "recommendations.embeddings";
// hardware too slow for overnight embedding of a large catalog → structured-only
const MAX_MS_PER_TEXT = 500;
const BATCH_SIZE = 16;

export interface EmbeddingCapability {
	enabled: boolean;
	backend: "auto" | "wasm" | "none";
	msPerText: number | null;
	model: string;
	version: number;
	decidedAt: string;
}

type Extractor = (
	texts: string[],
	opts: { pooling: "mean"; normalize: boolean },
) => Promise<{ dims: number[]; data: Float32Array }>;

let extractorPromise: Promise<Extractor> | null = null;

async function loadExtractor(): Promise<Extractor> {
	if (!extractorPromise) {
		extractorPromise = (async () => {
			const { env, pipeline } = await import("@huggingface/transformers");
			env.cacheDir = path.join(process.cwd(), "data", "models");
			const pipe = await pipeline("feature-extraction", EMBEDDING_MODEL, {
				dtype: "q8",
			});
			return pipe as unknown as Extractor;
		})();
	}
	return extractorPromise;
}

const PROBE_TEXTS = [
	"query: 転生したらスライムだった件 異世界 ファンタジー",
	"query: A cozy small-town mystery with a retired detective",
	"query: Novela ligera de fantasía, villana reencarnada, romance",
	"query: 薬屋のひとりごと 後宮 ミステリー 中華風",
	"query: Hard science fiction, generation ship, first contact",
	"query: 剣と魔法の王道ファンタジー 成り上がり 冒険",
	"query: Slice of life romantic comedy set in a Tokyo high school",
	"query: Dark fantasy, dungeon crawling, morally gray protagonist",
];

export async function resolveCapability(): Promise<EmbeddingCapability> {
	const stored =
		await settingsRepository.getValue<EmbeddingCapability>(CAPABILITY_KEY);
	if (
		stored &&
		stored.model === EMBEDDING_MODEL &&
		stored.version === EMBEDDER_VERSION
	) {
		return stored;
	}

	let capability: EmbeddingCapability;
	try {
		const extractor = await loadExtractor();
		await extractor(PROBE_TEXTS.slice(0, 1), {
			pooling: "mean",
			normalize: true,
		});
		const t0 = performance.now();
		await extractor(PROBE_TEXTS, { pooling: "mean", normalize: true });
		const msPerText = (performance.now() - t0) / PROBE_TEXTS.length;
		capability = {
			enabled: msPerText <= MAX_MS_PER_TEXT,
			backend: "auto",
			msPerText: Math.round(msPerText * 10) / 10,
			model: EMBEDDING_MODEL,
			version: EMBEDDER_VERSION,
			decidedAt: new Date().toISOString(),
		};
		if (!capability.enabled) {
			log.warn(
				{ msPerText: capability.msPerText, maxMsPerText: MAX_MS_PER_TEXT },
				"Embedding probe too slow, running structured-only",
			);
		}
	} catch (error) {
		log.warn(
			{ error },
			"Embedding backend unavailable, running structured-only",
		);
		capability = {
			enabled: false,
			backend: "none",
			msPerText: null,
			model: EMBEDDING_MODEL,
			version: EMBEDDER_VERSION,
			decidedAt: new Date().toISOString(),
		};
	}

	await settingsRepository.upsert(CAPABILITY_KEY, capability);
	return capability;
}

// e5 symmetric-similarity prefix; both sides use "query: "
export function toEmbeddingInput(text: string): string {
	return `query: ${text}`;
}

export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
	const extractor = await loadExtractor();
	const out: Float32Array[] = [];
	for (let i = 0; i < texts.length; i += BATCH_SIZE) {
		const batch = texts.slice(i, i + BATCH_SIZE).map(toEmbeddingInput);
		const result = await extractor(batch, { pooling: "mean", normalize: true });
		const dim = result.dims[1] ?? 0;
		for (let j = 0; j < batch.length; j++) {
			out.push(result.data.slice(j * dim, (j + 1) * dim));
		}
	}
	return out;
}

export async function hashEmbeddingInput(text: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(text),
	);
	return Buffer.from(digest).toString("hex").slice(0, 32);
}
