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
				amazonRating: 3.6 + (local % 4) * 0.1,
				amazonReviewCount: 20 + (local % 5) * 10,
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
