import {
	buildEmbeddingSpace,
	EMBEDDING_DIM,
	type EmbeddingSpace,
} from "./candidate-generation";
import type {
	HistoricalEvaluationInput,
	OfflineUserHistory,
} from "./offline-evaluation";
import type { WorkAggregate, WorkKey } from "./types";
import { workKey } from "./types";

export interface SyntheticRecommendationDataset
	extends Pick<
		HistoricalEvaluationInput,
		"baseWorks" | "histories" | "embeddingSpace" | "titleKeyByWork"
	> {
	description: string;
}

const CLUSTERS = [
	{
		language: "ja",
		label: "学園ラブコメ",
		titles: [
			"放課後の約束",
			"隣の席の秘密",
			"春色ラブレター",
			"生徒会の彼女",
			"雨の日の告白",
			"図書室で待ってる",
			"幼なじみの方程式",
			"夏祭りと君",
			"先輩は素直じゃない",
			"文化祭の奇跡",
			"星空の帰り道",
			"君と始める新学期",
		],
	},
	{
		language: "en",
		label: "Epic fantasy",
		titles: [
			"The Ember Crown",
			"Dragon Road",
			"The Last Spellblade",
			"Kingdom of Ash",
			"The Silver Familiar",
			"Throne of Storms",
			"A Map of Forgotten Realms",
			"The Runebound Knight",
			"Witches of the Northern Gate",
			"The Glass Citadel",
			"Oath of the Phoenix",
			"The Moonlit Quest",
		],
	},
	{
		language: "es",
		label: "Misterio acogedor",
		titles: [
			"El crimen de la librería",
			"Café para un detective",
			"La llave del invernadero",
			"Muerte en el pueblo azul",
			"El secreto de la pastelera",
			"Cartas desde la estación",
			"La bibliotecaria sospechosa",
			"Un cadáver bajo la lluvia",
			"El misterio del gato negro",
			"Té con la inspectora",
			"La casa de las persianas verdes",
			"Último tren a Villaniebla",
		],
	},
] as const;

function coherentVector(cluster: number, workIndex: number): Float32Array {
	const vector = new Float32Array(EMBEDDING_DIM);
	// Same-cluster cosine = .90; cross-cluster cosine = .78. This mirrors the
	// observed multilingual-e5 band used by scorer.embeddingSimilarity.
	vector[0] = Math.sqrt(0.78);
	vector[1 + cluster] = Math.sqrt(0.12);
	vector[4 + workIndex] = Math.sqrt(0.1);
	return vector;
}

export function createSyntheticRecommendationDataset(): SyntheticRecommendationDataset {
	const baseTime = Date.UTC(2025, 0, 1);
	const baseWorks: WorkAggregate[] = [];
	const titleKeyByWork = new Map<WorkKey, string>();
	const embeddings: { key: WorkKey; vector: Float32Array }[] = [];

	for (let cluster = 0; cluster < CLUSTERS.length; cluster++) {
		const definition = CLUSTERS[cluster];
		if (!definition) continue;
		for (let local = 0; local < definition.titles.length; local++) {
			const id = cluster * 100 + local + 1;
			const key = workKey("series", id);
			const title = definition.titles[local] ?? `${definition.label} ${local}`;
			baseWorks.push({
				kind: "series",
				id,
				authorIds: new Set([cluster * 1000 + Math.floor(local / 3) + 1]),
				genreIds: new Set([cluster + 1]),
				tagIds: new Set([cluster * 100 + Math.floor(local / 4) + 1]),
				publisherIds: new Set([cluster + 1]),
				languageCode: definition.language,
				memberBookIds: [id],
				embeddingText: `${title} ${definition.label}`,
				engagedUserIds: new Set(),
				likeCount: 0,
				completionCount: 0,
				rating: 3.6 + (local % 4) * 0.1,
				ratingCount: 20 + (local % 5) * 10,
				createdAtMs: baseTime - 86_400_000,
			});
			titleKeyByWork.set(key, title.normalize("NFKC").toLocaleLowerCase());
			embeddings.push({
				key,
				vector: coherentVector(cluster, cluster * 12 + local),
			});
		}
	}

	const histories: OfflineUserHistory[] = [];
	for (let cluster = 0; cluster < CLUSTERS.length; cluster++) {
		for (let member = 0; member < 8; member++) {
			const rows: OfflineUserHistory["rows"] = [];
			const chosen = new Set<number>();
			for (let step = 0; step < 7; step++) {
				let local = (member * 2 + step * 3) % 12;
				while (chosen.has(local)) local = (local + 1) % 12;
				chosen.add(local);
				rows.push({
					kind: "series",
					itemId: cluster * 100 + local + 1,
					signal: step % 3 === 2 ? "completed" : "like",
					atMs: baseTime + (step + 1) * 7 * 86_400_000 + member * 3_600_000,
				});
			}
			// A coherent explicit rejection outside the preferred taste cluster.
			const rejectedCluster = (cluster + 1) % CLUSTERS.length;
			rows.push({
				kind: "series",
				itemId: rejectedCluster * 100 + member + 1,
				signal: "not_interested",
				atMs: baseTime + 18 * 86_400_000 + member * 3_600_000,
			});
			histories.push({ userId: `synthetic-${cluster}-${member}`, rows });
		}
	}

	const embeddingSpace: EmbeddingSpace = buildEmbeddingSpace(embeddings);
	return {
		description:
			"36 works in three multilingual taste clusters; 24 users with seven chronological positives and one explicit cross-cluster rejection.",
		baseWorks,
		histories,
		embeddingSpace,
		titleKeyByWork,
	};
}

// ---------------------------------------------------------------------------
// Hard multilingual dataset: 3 languages × 3 confusable sub-genres, standalone
// books, sparse/no-description works, cross-lingual bridges, emergent
// blockbusters, abandoned reads, and — the point — taste-drift vs sampler user
// populations tuned to the 7-day session half-life vs the batch's 90-day one,
// so recall does NOT saturate and W_SESSION has an interior optimum to find.
// ---------------------------------------------------------------------------

const HARD_SUPERS = [
	{
		language: "ja",
		subs: ["学園ラブコメ", "異世界ファンタジー", "本格ミステリー"],
	},
	{ language: "en", subs: ["Epic fantasy", "Hard sci-fi", "Cozy mystery"] },
	{
		language: "es",
		subs: ["Realismo mágico", "Thriller negro", "Romance histórico"],
	},
] as const;

const HARD_WORKS_PER_SUB = 8;
const HARD_DAY = 86_400_000;
const hardSubId = (sub: number, local: number) => 2000 + sub * 10 + local;

// Cross-lingual bridges: work (sub, local) also relates to another super.
const HARD_BRIDGES: Record<number, number> = {
	[hardSubId(1, 5)]: 1, // ja 異世界 ↔ en Epic fantasy
	[hardSubId(4, 5)]: 2, // en Hard sci-fi ↔ es Realismo mágico
	[hardSubId(7, 5)]: 0, // es Thriller negro ↔ ja 本格ミステリー
};

/** Unit vector in the [0.78,0.92] cosine band: floor .78, +super, +sub, +unique. */
function hardVector(
	superIdx: number,
	subIdx: number,
	uniqueIndex: number,
	opts: { bridgeSuper?: number; sparse?: boolean } = {},
): Float32Array {
	const v = new Float32Array(EMBEDDING_DIM);
	const superMass = 0.07;
	const subMass = opts.sparse ? 0.02 : 0.07;
	const uniqueMass = 1 - 0.78 - superMass - subMass;
	v[0] = Math.sqrt(0.78);
	if (opts.bridgeSuper !== undefined && opts.bridgeSuper !== superIdx) {
		v[1 + superIdx] = Math.sqrt(superMass / 2);
		v[1 + opts.bridgeSuper] = Math.sqrt(superMass / 2);
	} else {
		v[1 + superIdx] = Math.sqrt(superMass);
	}
	v[10 + subIdx] = Math.sqrt(subMass);
	v[60 + uniqueIndex] = Math.sqrt(uniqueMass);
	return v;
}

export function createHardSyntheticRecommendationDataset(): SyntheticRecommendationDataset {
	const baseTime = Date.UTC(2025, 0, 1);
	const baseWorks: WorkAggregate[] = [];
	const titleKeyByWork = new Map<WorkKey, string>();
	const embeddings: { key: WorkKey; vector: Float32Array }[] = [];
	const subWorks: number[][] = [];

	let subIdx = 0;
	for (let sup = 0; sup < HARD_SUPERS.length; sup++) {
		const def = HARD_SUPERS[sup];
		if (!def) continue;
		for (let s = 0; s < def.subs.length; s++) {
			const label = def.subs[s] ?? `${def.language}-${s}`;
			const ids: number[] = [];
			for (let local = 0; local < HARD_WORKS_PER_SUB; local++) {
				const id = hardSubId(subIdx, local);
				ids.push(id);
				const kind = local >= 6 ? "book" : "series";
				const sparse = local === 7; // no-description-style, hard to place
				const bridgeSuper = HARD_BRIDGES[id];
				const key = workKey(kind, id);
				baseWorks.push({
					kind,
					id,
					authorIds: new Set([subIdx * 100 + Math.floor(local / 2) + 1]),
					genreIds: new Set([subIdx + 1]),
					tagIds: new Set(sparse ? [] : [subIdx * 10 + (local % 3) + 1]),
					publisherIds: new Set([sup + 1]),
					languageCode: def.language,
					memberBookIds: [id],
					embeddingText: sparse ? label : `${label} ${local}`,
					engagedUserIds: new Set(),
					likeCount: 0,
					completionCount: 0,
					rating: sparse ? null : 3.4 + (local % 5) * 0.12,
					ratingCount: sparse ? null : 15 + (local % 6) * 12,
					createdAtMs: baseTime - HARD_DAY,
				});
				titleKeyByWork.set(key, `${label}-${local}`.toLocaleLowerCase());
				embeddings.push({
					key,
					vector: hardVector(sup, subIdx, subIdx * HARD_WORKS_PER_SUB + local, {
						bridgeSuper,
						sparse,
					}),
				});
			}
			subWorks[subIdx] = ids;
			subIdx++;
		}
	}

	const superOfSub = (sub: number) => Math.floor(sub / 3);
	// Deterministic, bounds-checked work pick (avoids non-null assertions).
	const pick = (sub: number, i: number): number => {
		const works = subWorks[sub];
		const id = works?.[i % HARD_WORKS_PER_SUB];
		if (id === undefined) throw new Error(`no work for sub ${sub}, index ${i}`);
		return id;
	};
	// Blockbuster = first work of each super's first sub (emergent popularity/SAO).
	const blockbusterFor = (sup: number) => pick(sup * 3, 0);
	const histories: OfflineUserHistory[] = [];
	const at = (week: number, member: number) =>
		baseTime + week * 7 * HARD_DAY + member * 3_600_000;
	const push = (
		rows: OfflineUserHistory["rows"],
		id: number,
		signal: string,
		week: number,
		member: number,
	) =>
		rows.push({ kind: "series", itemId: id, signal, atMs: at(week, member) });

	let uid = 0;
	const newUser = () => `hard-${uid++}`;
	const seedBlockbuster = (
		rows: OfflineUserHistory["rows"],
		sup: number,
		m: number,
	) => push(rows, blockbusterFor(sup), "completed", 0, m);

	// 1) Pure fans — read within one sub, adjacent-sub distractors make it non-trivial.
	for (let sub = 0; sub < 9; sub++) {
		for (let m = 0; m < 3; m++) {
			const rows: OfflineUserHistory["rows"] = [];
			seedBlockbuster(rows, superOfSub(sub), m);
			for (let step = 0; step < 6; step++) {
				push(
					rows,
					pick(sub, m + step),
					step % 3 === 2 ? "completed" : "like",
					step + 1,
					m,
				);
			}
			// explicit rejection in an adjacent sub of the same super (confusable)
			const adj = superOfSub(sub) * 3 + (((sub % 3) + 1) % 3);
			push(rows, pick(adj, m), "not_interested", 7, m);
			histories.push({ userId: newUser(), rows });
		}
	}

	// 2) Committed drifters — 4 reads in sub A then 3 in sub B (permanent switch).
	//    Batch (90d) still weights A; session (7d) captures B → helps late targets.
	const driftPairs: [number, number][] = [
		[0, 1],
		[1, 2],
		[3, 4],
		[4, 5],
		[6, 7],
		[7, 8], // adjacent (same-super)
		[0, 3],
		[2, 5],
		[6, 0], // cross-super (harder)
	];
	for (const [a, b] of driftPairs) {
		for (let m = 0; m < 3; m++) {
			const rows: OfflineUserHistory["rows"] = [];
			seedBlockbuster(rows, superOfSub(a), m);
			for (let step = 0; step < 4; step++)
				push(
					rows,
					pick(a, m + step),
					step % 2 ? "completed" : "like",
					step + 1,
					m,
				);
			for (let step = 0; step < 3; step++)
				push(
					rows,
					pick(b, m + step),
					step % 2 ? "completed" : "like",
					step + 5,
					m,
				);
			histories.push({ userId: newUser(), rows });
		}
	}

	// 3) Samplers — steady in sub A with one B blip, then back to A. High session
	//    weight over-commits to the blip and demotes A targets → overshoot pressure.
	const samplerPairs: [number, number][] = [
		[0, 4],
		[1, 5],
		[3, 7],
		[4, 8],
		[6, 1],
		[8, 2],
	];
	for (const [a, b] of samplerPairs) {
		for (let m = 0; m < 3; m++) {
			const rows: OfflineUserHistory["rows"] = [];
			seedBlockbuster(rows, superOfSub(a), m);
			for (let step = 0; step < 4; step++)
				push(
					rows,
					pick(a, m + step),
					step % 2 ? "completed" : "like",
					step + 1,
					m,
				);
			push(rows, pick(b, m), "like", 5, m); // the blip
			for (let step = 4; step < 7; step++)
				push(
					rows,
					pick(a, m + step),
					step % 2 ? "completed" : "like",
					step + 2,
					m,
				);
			// abandoned read: started B's neighbour and bailed — must not seed positively
			push(rows, pick(b, m + 3), "abandoned", 6, m);
			histories.push({ userId: newUser(), rows });
		}
	}

	// 4) Bilingual — alternate a ja sub and an en sub; aggregate taste is muddled,
	//    only recency says which language they're in right now.
	const biPairs: [number, number][] = [
		[0, 5],
		[1, 3],
		[2, 4],
	];
	for (const [a, b] of biPairs) {
		for (let m = 0; m < 3; m++) {
			const rows: OfflineUserHistory["rows"] = [];
			for (let step = 0; step < 7; step++) {
				const sub = step % 2 === 0 ? a : b;
				push(
					rows,
					pick(sub, m + Math.floor(step / 2)),
					step % 3 === 2 ? "completed" : "like",
					step + 1,
					m,
				);
			}
			histories.push({ userId: newUser(), rows });
		}
	}

	const embeddingSpace: EmbeddingSpace = buildEmbeddingSpace(embeddings);
	return {
		description: `${baseWorks.length} works across ${HARD_SUPERS.length} languages × 3 confusable sub-genres (standalone books, sparse/no-desc works, cross-lingual bridges, emergent blockbusters); ${histories.length} users spanning pure fans, committed drifters, samplers, and bilinguals with abandoned reads and cross-sub rejections.`,
		baseWorks,
		histories,
		embeddingSpace,
		titleKeyByWork,
	};
}
