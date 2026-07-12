// Read-only historical walk-forward evaluation for the current recommender.
//   bun run recs:evaluate --cases=50 --k=10
//   bun run recs:evaluate --synthetic --cases=100 --k=10 --json

import { pool } from "@nanahoshi-v2/db";
import { buildEmbeddingSpace } from "../src/modules/recommendations/candidate-generation";
import {
	evaluateHistoricalWalkForward,
	type HistoricalEvaluationResult,
} from "../src/modules/recommendations/offline-evaluation";
import { createSyntheticRecommendationDataset } from "../src/modules/recommendations/offline-evaluation.synthetic";
import { recommendationComputeRepository as repo } from "../src/modules/recommendations/recommendation-compute.repository";
import { WEIGHTS_VERSION } from "../src/modules/recommendations/scorer";
import type { WorkKey } from "../src/modules/recommendations/types";
import { workKey } from "../src/modules/recommendations/types";

function option(name: string): string | undefined {
	return process.argv
		.find((argument) => argument.startsWith(`--${name}=`))
		?.slice(name.length + 3);
}

function positiveInteger(
	name: string,
	fallback: number,
	aliases: string[] = [],
): number {
	const raw = option(name) ?? aliases.map(option).find(Boolean);
	if (raw === undefined) return fallback;
	const parsed = Number(raw);
	if (!Number.isInteger(parsed) || parsed <= 0)
		throw new Error(`--${name} must be a positive integer`);
	return parsed;
}

function rounded(result: HistoricalEvaluationResult) {
	const row = (summary: HistoricalEvaluationResult["report"]["overall"]) => ({
		cases: summary.cases,
		recall: `${(summary.recallAtK * 100).toFixed(2)}%`,
		ndcg: summary.ndcgAtK.toFixed(4),
		mrr: summary.mrrAtK.toFixed(4),
		avgLength: summary.averageListLength.toFixed(2),
		coverage: `${(summary.catalogCoverage * 100).toFixed(2)}%`,
		novelty: summary.novelty.toFixed(4),
		diversity: summary.intraListDiversity.toFixed(4),
		exactNegative: `${(summary.exactNegativeExposureRate * 100).toFixed(2)}%`,
		similarNegative: `${(summary.similarNegativeExposureRate * 100).toFixed(2)}%`,
	});
	return {
		current: row(result.report.overall),
		popularity: row(result.popularityBaseline.overall),
	};
}

const k = positiveInteger("k", 10);
const maxCases = positiveInteger("cases", 50, ["users"]);
const minPositives = positiveInteger("min-positives", 3);
const seed = positiveInteger("seed", 42);
const requestedServer = option("server");
const synthetic = process.argv.includes("--synthetic");
const jsonOnly = process.argv.includes("--json");

const reports: unknown[] = [];
try {
	if (synthetic) {
		const dataset = createSyntheticRecommendationDataset();
		const result = evaluateHistoricalWalkForward({
			...dataset,
			k,
			minPositiveWorks: minPositives,
			maxCases,
			caseSeed: seed,
		});
		reports.push({
			serverId: "synthetic",
			algorithm: `weights-v${WEIGHTS_VERSION}`,
			mode: "historical walk-forward",
			description: dataset.description,
			parameters: { k, maxCases, minPositives, seed },
			population: {
				members: dataset.histories.length,
				works: dataset.baseWorks.length,
				availableCases: result.availableCases,
				evaluatedCases: result.cases.length,
			},
			metrics: result.report,
			popularityBaseline: result.popularityBaseline,
			cases: result.cases,
		});
	} else {
		const availableServers = await repo.listOrganizationIds();
		const serverIds = requestedServer
			? availableServers.filter((id) => id === requestedServer)
			: availableServers;
		if (requestedServer && serverIds.length === 0)
			throw new Error(`Unknown server: ${requestedServer}`);

		for (const serverId of serverIds) {
			const memberIds = await repo.listOrgMemberIds(serverId);
			const histories = await Promise.all(
				memberIds.map(async (userId) => ({
					userId,
					rows: await repo.loadUserSignalWorks(serverId, userId),
				})),
			);
			const baseWorks = await repo.loadWorkAggregates(serverId);
			const embeddingRows = await repo.loadEmbeddings(serverId);
			const embeddingSpace =
				embeddingRows.length === 0
					? null
					: buildEmbeddingSpace(
							embeddingRows.map((row) => ({
								key: workKey(row.kind, row.itemId),
								vector: row.vector,
							})),
						);
			const allKeys = baseWorks.map((work) => ({
				kind: work.kind,
				id: work.id,
			}));
			const titleRows = await repo.loadRecommendationTitleKeys(
				serverId,
				allKeys,
			);
			const titleKeyByWork = new Map<WorkKey, string>([
				...titleRows.entries(),
			] as [WorkKey, string][]);
			const result = evaluateHistoricalWalkForward({
				baseWorks,
				histories,
				embeddingSpace,
				titleKeyByWork,
				k,
				minPositiveWorks: minPositives,
				maxCases,
				caseSeed: seed,
			});
			reports.push({
				serverId,
				algorithm: `weights-v${WEIGHTS_VERSION}`,
				mode: "historical walk-forward",
				parameters: { k, maxCases, minPositives, seed },
				population: {
					members: memberIds.length,
					works: baseWorks.length,
					availableCases: result.availableCases,
					evaluatedCases: result.cases.length,
				},
				metrics: result.report,
				popularityBaseline: result.popularityBaseline,
				cases: result.cases.map(({ userId: _, ...evaluationCase }) =>
					Object.assign(evaluationCase, {
						title: titleKeyByWork.get(evaluationCase.target),
					}),
				),
			});
		}
	}

	if (jsonOnly) {
		console.log(
			JSON.stringify(
				{ generatedAt: new Date().toISOString(), reports },
				null,
				2,
			),
		);
	} else {
		for (const report of reports as {
			serverId: string;
			algorithm: string;
			population: unknown;
			metrics: HistoricalEvaluationResult["report"];
			popularityBaseline: HistoricalEvaluationResult["popularityBaseline"];
		}[]) {
			console.log(`\nServer ${report.serverId} · ${report.algorithm}`);
			console.table(
				rounded({
					report: report.metrics,
					popularityBaseline: report.popularityBaseline,
					cases: [],
					availableCases: 0,
				}),
			);
			console.log("population", report.population);
		}
	}
} finally {
	await pool.end();
}
