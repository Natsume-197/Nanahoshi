import {
	type EvaluationPair,
	type EvaluationPublication,
	evaluateReadListenMatches,
} from "../src/routers/read-listen/read-listen-match-evaluation";

type DatasetRow =
	| ({ kind: "publication" } & EvaluationPublication)
	| ({ kind: "pair" } & EvaluationPair);

const datasetPath = process.argv[2];
if (!datasetPath) {
	throw new Error(
		"Usage: bun packages/api/scripts/read-listen-match-evaluate.ts <dataset.jsonl>",
	);
}

function parseDatasetLine(line: string): DatasetRow {
	try {
		return JSON.parse(line) as DatasetRow;
	} catch {
		// PostgreSQL COPY text mode doubles every backslash. Accept that format so
		// production snapshots can be streamed without a custom export utility.
		return JSON.parse(line.replaceAll("\\\\", "\\")) as DatasetRow;
	}
}

const rows = (await Bun.file(datasetPath).text())
	.split("\n")
	.filter(Boolean)
	.map(parseDatasetLine);
const publications = rows.flatMap((row) =>
	row.kind === "publication" ? [row] : [],
);
const pairs = rows.flatMap((row) => (row.kind === "pair" ? [row] : []));
const report = evaluateReadListenMatches(publications, pairs);

function percent(value: number): string {
	return `${(value * 100).toFixed(1)}%`;
}
console.log(`Audiobooks evaluated: ${report.evaluatedCount}`);
console.log(`Confirmed pairs: ${report.pairCount}`);
console.log(`Missing publications: ${report.missingPublicationCount}`);
console.log(`Top-1: ${percent(report.top1)}`);
console.log(`Semantic top-1: ${percent(report.semanticTop1)}`);
console.log(`Top-3: ${percent(report.top3)}`);
console.log(`Top-5: ${percent(report.top5)}`);
console.log(`MRR: ${report.meanReciprocalRank.toFixed(3)}`);
console.log(
	`Positive coverage @${report.matcherThreshold}: ${percent(report.positiveEligibility)}`,
);
console.log(
	`Top proposal precision @${report.matcherThreshold}: ${percent(report.proposalPrecision)} (${report.proposalCount} proposals)`,
);
console.log(
	`Semantic proposal precision @${report.matcherThreshold}: ${percent(report.semanticProposalPrecision)}`,
);
console.log("Threshold sweep:");
console.table(
	report.thresholdSweep.map((row) => ({
		threshold: row.threshold,
		coverage: percent(row.positiveCoverage),
		proposals: row.proposalCount,
		strictPrecision: percent(row.strictPrecision),
		semanticPrecision: percent(row.semanticPrecision),
	})),
);
console.log("Highest-scoring failures:");
console.log(JSON.stringify(report.failures.slice(0, 30), null, 2));
