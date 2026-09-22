/**
 * Live, read-only metadata-provider benchmark.
 *
 * bun run metadata:benchmark -- --server=<organization-id> --fixture=<file.json>
 * Optional: --providers=googlebooks,openlibrary --out=/tmp/metadata-benchmark.json
 */
import { readFile } from "node:fs/promises";
import type { CatalogIdentityEvidence } from "../src/modules/catalogIdentity";
import { assessCatalogIdentity } from "../src/modules/catalogIdentity";
import type { BookSearchCandidate } from "../src/routers/books/metadata/providers/IMetadata.provider";
import {
	BOOK_PROVIDER_IDS,
	type MetadataProviderName,
} from "../src/routers/books/metadata/providers/provider.manifest";

type Fixture = {
	name: string;
	query: { title: string; author?: string };
	expected: CatalogIdentityEvidence;
};

function option(name: string) {
	const prefix = `--${name}=`;
	return process.argv
		.find((arg) => arg.startsWith(prefix))
		?.slice(prefix.length);
}

const serverId = option("server");
const fixturePath = option("fixture");
if (!serverId || !fixturePath) {
	throw new Error("Required: --server=<organization-id> --fixture=<file.json>");
}

const requestedProviders = (
	option("providers")?.split(",") ?? BOOK_PROVIDER_IDS
)
	.map((value) => value.trim())
	.filter((value): value is MetadataProviderName =>
		BOOK_PROVIDER_IDS.includes(value as MetadataProviderName),
	);
const fixtures = JSON.parse(await readFile(fixturePath, "utf8")) as Fixture[];
if (!Array.isArray(fixtures) || fixtures.length === 0) {
	throw new Error("The benchmark fixture must contain at least one case");
}

const { BOOK_PROVIDERS } = await import(
	"../src/routers/books/metadata/providers/registry"
);

const realFetch = globalThis.fetch;
let httpRequests = 0;
globalThis.fetch = ((...args: Parameters<typeof fetch>) => {
	httpRequests++;
	return realFetch(...args);
}) as typeof fetch;

function candidateEvidence(
	candidate: BookSearchCandidate,
): CatalogIdentityEvidence {
	return {
		kind: "book",
		title: candidate.title,
		titleRomaji: candidate.titleRomaji,
		creators: candidate.authors?.map(({ name }) => ({ name, role: "Author" })),
	};
}

function percentile(values: number[], fraction: number) {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((a, b) => a - b);
	return (
		sorted[
			Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
		] ?? 0
	);
}

const report: Record<string, unknown> = {};
try {
	for (const providerName of requestedProviders) {
		const provider = BOOK_PROVIDERS[providerName];
		const available = await provider.isAvailable(serverId);
		const rows: Array<{
			name: string;
			status:
				| "confirmed"
				| "indeterminate"
				| "rejected"
				| "no_candidate"
				| "error";
			latencyMs: number;
			httpRequests: number;
			error?: string;
		}> = [];
		if (available) {
			for (const fixture of fixtures) {
				const startedAt = performance.now();
				const requestStart = httpRequests;
				try {
					const candidates = await provider.search(fixture.query, { serverId });
					const top = candidates[0];
					rows.push({
						name: fixture.name,
						status: top
							? assessCatalogIdentity(fixture.expected, candidateEvidence(top))
									.status
							: "no_candidate",
						latencyMs: Math.round(performance.now() - startedAt),
						httpRequests: httpRequests - requestStart,
					});
				} catch (error) {
					rows.push({
						name: fixture.name,
						status: "error",
						latencyMs: Math.round(performance.now() - startedAt),
						httpRequests: httpRequests - requestStart,
						error: error instanceof Error ? error.message : String(error),
					});
				}
			}
		}
		const latencies = rows.map((row) => row.latencyMs);
		const candidates = rows.filter(
			(row) => row.status !== "no_candidate" && row.status !== "error",
		);
		report[providerName] = {
			available,
			cases: fixtures.length,
			coverage: fixtures.length ? candidates.length / fixtures.length : 0,
			top1Accuracy: fixtures.length
				? rows.filter((row) => row.status === "confirmed").length /
					fixtures.length
				: 0,
			falsePositiveRate: candidates.length
				? rows.filter((row) => row.status === "rejected").length /
					candidates.length
				: 0,
			latencyMs: {
				p50: percentile(latencies, 0.5),
				p95: percentile(latencies, 0.95),
			},
			quota: {
				httpRequests: rows.reduce((sum, row) => sum + row.httpRequests, 0),
				rateLimited: rows.filter((row) =>
					/rate.?limit|HTTP 429/i.test(row.error ?? ""),
				).length,
			},
			rows,
		};
	}
} finally {
	globalThis.fetch = realFetch;
}

const output = JSON.stringify(
	{ generatedAt: new Date().toISOString(), serverId, report },
	null,
	2,
);
const outputPath = option("out");
if (outputPath) await Bun.write(outputPath, output);
console.log(output);
