import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_CONTAINERS = [
	"nanahoshi-v2-server",
	"nanahoshi-v2-worker",
	"nanahoshi-v2-postgres",
	"nanahoshi-v2-redis",
] as const;

export type CliOptions = {
	help: boolean;
	label?: string;
	duration: number;
	interval: number;
	output?: string;
	containers: string[];
	url?: string;
	requests?: number;
	concurrency?: number;
};

export type NumericSummary = {
	min: number;
	median: number;
	p95: number;
	max: number;
};

export type ContainerSample = {
	cpuPercent: number;
	memoryUsageMiB: number;
	memoryLimitMiB: number;
	pids: number;
	netIO: string;
	blockIO: string;
};

export type ResourceSample = {
	timestamp: string;
	containers: Record<string, ContainerSample>;
	total: {
		cpuPercent: number;
		memoryUsageMiB: number;
		pids: number;
	};
};

type ContainerMetadata = {
	name: string;
	image: string;
	startedAt: string;
	health: string | null;
};

type HttpSummary = {
	url: string;
	requests: number;
	succeeded: number;
	failed: number;
	latencyMs: Omit<NumericSummary, "min"> | null;
};

const HELP = `Usage:
  bun run backend:baseline -- --label=<slug> [options]

Options:
  --label=<slug>          Required label: letters, numbers, _ and - only
  --duration=<seconds>    Recording duration (default: 60)
  --interval=<seconds>    Sampling interval (default: 2)
  --output=<path>         JSON output path
  --containers=<names>    Comma-separated container names
  --url=<http-url>        Optional HTTP workload URL
  --requests=<count>      HTTP request count (required with --url)
  --concurrency=<count>   HTTP concurrency (required with --url)
  --help                  Show this help without contacting Docker
`;

function optionValue(arg: string, name: string): string | undefined {
	const prefix = `--${name}=`;
	return arg.startsWith(prefix) ? arg.slice(prefix.length) : undefined;
}

function positiveNumber(value: string, name: string): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(`--${name} must be a positive number`);
	}
	return parsed;
}

function positiveInteger(value: string, name: string): number {
	const parsed = positiveNumber(value, name);
	if (!Number.isInteger(parsed)) {
		throw new Error(`--${name} must be a positive integer`);
	}
	return parsed;
}

export function parseArgs(args: string[]): CliOptions {
	const options: CliOptions = {
		help: false,
		duration: 60,
		interval: 2,
		containers: [...DEFAULT_CONTAINERS],
	};

	for (const arg of args) {
		if (arg === "--help") {
			options.help = true;
			continue;
		}

		const label = optionValue(arg, "label");
		if (label !== undefined) {
			if (!/^[A-Za-z0-9_-]+$/.test(label)) {
				throw new Error("--label must contain only letters, numbers, _ and -");
			}
			options.label = label;
			continue;
		}

		const duration = optionValue(arg, "duration");
		if (duration !== undefined) {
			options.duration = positiveInteger(duration, "duration");
			continue;
		}

		const interval = optionValue(arg, "interval");
		if (interval !== undefined) {
			options.interval = positiveNumber(interval, "interval");
			continue;
		}

		const output = optionValue(arg, "output");
		if (output !== undefined) {
			if (!output.trim()) throw new Error("--output must not be empty");
			options.output = output;
			continue;
		}

		const containers = optionValue(arg, "containers");
		if (containers !== undefined) {
			const names = [
				...new Set(containers.split(",").map((v) => v.trim())),
			].filter(Boolean);
			if (names.length === 0) {
				throw new Error("--containers must contain at least one name");
			}
			options.containers = names;
			continue;
		}

		const url = optionValue(arg, "url");
		if (url !== undefined) {
			let parsed: URL;
			try {
				parsed = new URL(url);
			} catch {
				throw new Error("--url must be a valid HTTP or HTTPS URL");
			}
			if (!["http:", "https:"].includes(parsed.protocol)) {
				throw new Error("--url must use HTTP or HTTPS");
			}
			if (parsed.username || parsed.password) {
				throw new Error("--url must not contain embedded credentials");
			}
			if (parsed.search || parsed.hash) {
				throw new Error("--url must not contain query parameters or fragments");
			}
			options.url = parsed.toString();
			continue;
		}

		const requests = optionValue(arg, "requests");
		if (requests !== undefined) {
			options.requests = positiveInteger(requests, "requests");
			continue;
		}

		const concurrency = optionValue(arg, "concurrency");
		if (concurrency !== undefined) {
			options.concurrency = positiveInteger(concurrency, "concurrency");
			continue;
		}

		throw new Error(`Unknown option: ${arg}`);
	}

	if (options.help) return options;
	if (!options.label) throw new Error("--label is required");
	if (options.interval > options.duration) {
		throw new Error("--interval must not be greater than --duration");
	}
	const workloadOptions = [options.url, options.requests, options.concurrency];
	const workloadCount = workloadOptions.filter(
		(value) => value !== undefined,
	).length;
	if (workloadCount !== 0 && workloadCount !== workloadOptions.length) {
		throw new Error(
			"--url, --requests and --concurrency must be provided together",
		);
	}
	return options;
}

export function parseBytes(value: string): number {
	const match = value
		.trim()
		.match(/^([0-9]+(?:\.[0-9]+)?)\s*(B|KiB|MiB|GiB|TiB)$/i);
	if (!match) throw new Error(`Invalid Docker byte value: ${value}`);
	const amount = Number(match[1]);
	const unit = match[2]?.toLowerCase();
	const multipliers: Record<string, number> = {
		b: 1,
		kib: 1024,
		mib: 1024 ** 2,
		gib: 1024 ** 3,
		tib: 1024 ** 4,
	};
	const multiplier = unit ? multipliers[unit] : undefined;
	if (!Number.isFinite(amount) || multiplier === undefined) {
		throw new Error(`Invalid Docker byte value: ${value}`);
	}
	return amount * multiplier;
}

export function parseMemoryUsage(value: string): {
	usageMiB: number;
	limitMiB: number;
} {
	const parts = value.split("/").map((part) => part.trim());
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		throw new Error(`Invalid Docker memory usage: ${value}`);
	}
	return {
		usageMiB: parseBytes(parts[0]) / 1024 ** 2,
		limitMiB: parseBytes(parts[1]) / 1024 ** 2,
	};
}

export function parseCpuPercent(value: string): number {
	const match = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)%$/);
	const parsed = match?.[1] ? Number(match[1]) : Number.NaN;
	if (!Number.isFinite(parsed)) {
		throw new Error(`Invalid Docker CPU percentage: ${value}`);
	}
	return parsed;
}

export function percentile(values: number[], quantile: number): number | null {
	if (values.length === 0) return null;
	if (!Number.isFinite(quantile) || quantile <= 0 || quantile > 1) {
		throw new Error("quantile must be greater than 0 and at most 1");
	}
	const sorted = [...values].sort((a, b) => a - b);
	const index = Math.max(0, Math.ceil(sorted.length * quantile) - 1);
	return sorted[index] ?? null;
}

export function summarize(values: number[]): NumericSummary {
	if (values.length === 0) throw new Error("Cannot summarize an empty sample");
	return {
		min: Math.min(...values),
		median: percentile(values, 0.5) as number,
		p95: percentile(values, 0.95) as number,
		max: Math.max(...values),
	};
}

export function aggregateSamples(samples: ResourceSample[]): {
	containers: Record<
		string,
		{
			memoryUsageMiB: NumericSummary;
			cpuPercent: NumericSummary;
			maxPids: number;
		}
	>;
	total: {
		memoryUsageMiB: NumericSummary;
		cpuPercent: NumericSummary;
		maxPids: number;
	};
} {
	if (samples.length === 0) throw new Error("Cannot aggregate zero samples");
	const expected = Object.keys(samples[0]?.containers ?? {}).sort();
	if (expected.length === 0)
		throw new Error("A sample must contain containers");
	for (const sample of samples) {
		const actual = Object.keys(sample.containers).sort();
		if (actual.join("\0") !== expected.join("\0")) {
			throw new Error(
				"Every sample must contain the same containers exactly once",
			);
		}

		const total = Object.values(sample.containers).reduce(
			(acc, item) => ({
				cpuPercent: acc.cpuPercent + item.cpuPercent,
				memoryUsageMiB: acc.memoryUsageMiB + item.memoryUsageMiB,
				pids: acc.pids + item.pids,
			}),
			{ cpuPercent: 0, memoryUsageMiB: 0, pids: 0 },
		);
		for (const key of ["cpuPercent", "memoryUsageMiB", "pids"] as const) {
			if (Math.abs(total[key] - sample.total[key]) > 0.001) {
				throw new Error(`Sample total ${key} does not match its containers`);
			}
		}
	}

	const containers = Object.fromEntries(
		expected.map((name) => {
			const values = samples.map((sample) => sample.containers[name]);
			if (values.some((value) => value === undefined)) {
				throw new Error(`Missing container sample: ${name}`);
			}
			const complete = values as ContainerSample[];
			return [
				name,
				{
					memoryUsageMiB: summarize(
						complete.map((value) => value.memoryUsageMiB),
					),
					cpuPercent: summarize(complete.map((value) => value.cpuPercent)),
					maxPids: Math.max(...complete.map((value) => value.pids)),
				},
			];
		}),
	);

	return {
		containers,
		total: {
			memoryUsageMiB: summarize(
				samples.map((sample) => sample.total.memoryUsageMiB),
			),
			cpuPercent: summarize(samples.map((sample) => sample.total.cpuPercent)),
			maxPids: Math.max(...samples.map((sample) => sample.total.pids)),
		},
	};
}

async function runCommand(args: string[]): Promise<string> {
	const process = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	if (exitCode !== 0) {
		throw new Error(
			`${args[0]} failed: ${stderr.trim() || `exit ${exitCode}`}`,
		);
	}
	return stdout.trim();
}

async function inspectContainers(
	names: string[],
): Promise<ContainerMetadata[]> {
	const metadata: ContainerMetadata[] = [];
	const unavailable: string[] = [];
	for (const name of names) {
		try {
			const output = await runCommand([
				"docker",
				"inspect",
				"--format",
				"{{.Name}}\t{{.Config.Image}}\t{{.State.StartedAt}}\t{{.State.Running}}\t{{if .State.Health}}{{.State.Health.Status}}{{end}}",
				name,
			]);
			const [rawName, image, startedAt, running, health] = output.split("\t");
			if (running !== "true" || !rawName || !image || !startedAt) {
				unavailable.push(name);
				continue;
			}
			metadata.push({
				name: rawName.replace(/^\//, ""),
				image,
				startedAt,
				health: health || null,
			});
		} catch {
			unavailable.push(name);
		}
	}
	if (unavailable.length > 0) {
		throw new Error(`Missing or stopped containers: ${unavailable.join(", ")}`);
	}
	return metadata;
}

type DockerStatsRow = {
	Name?: string;
	CPUPerc?: string;
	MemUsage?: string;
	PIDs?: string;
	NetIO?: string;
	BlockIO?: string;
};

export function parseDockerStats(
	lines: string,
	expectedNames: string[],
): ResourceSample {
	const containers: Record<string, ContainerSample> = {};
	for (const line of lines.split("\n").filter(Boolean)) {
		let row: DockerStatsRow;
		try {
			row = JSON.parse(line) as DockerStatsRow;
		} catch {
			throw new Error("Docker stats returned malformed JSON");
		}
		if (!row.Name || containers[row.Name]) {
			throw new Error(
				"Docker stats returned a missing or duplicate container name",
			);
		}
		if (!row.CPUPerc || !row.MemUsage || !row.PIDs) {
			throw new Error(`Docker stats omitted required fields for ${row.Name}`);
		}
		const memory = parseMemoryUsage(row.MemUsage);
		const pids = Number(row.PIDs);
		if (!Number.isInteger(pids) || pids < 0) {
			throw new Error(`Docker stats returned invalid PIDs for ${row.Name}`);
		}
		containers[row.Name] = {
			cpuPercent: parseCpuPercent(row.CPUPerc),
			memoryUsageMiB: memory.usageMiB,
			memoryLimitMiB: memory.limitMiB,
			pids,
			netIO: row.NetIO ?? "",
			blockIO: row.BlockIO ?? "",
		};
	}

	const actual = Object.keys(containers).sort();
	const expected = [...expectedNames].sort();
	if (actual.join("\0") !== expected.join("\0")) {
		throw new Error(
			"Docker stats did not return every requested container exactly once",
		);
	}
	const total = Object.values(containers).reduce(
		(acc, value) => ({
			cpuPercent: acc.cpuPercent + value.cpuPercent,
			memoryUsageMiB: acc.memoryUsageMiB + value.memoryUsageMiB,
			pids: acc.pids + value.pids,
		}),
		{ cpuPercent: 0, memoryUsageMiB: 0, pids: 0 },
	);
	return { timestamp: new Date().toISOString(), containers, total };
}

async function collectSample(names: string[]): Promise<ResourceSample> {
	const output = await runCommand([
		"docker",
		"stats",
		"--no-stream",
		"--format",
		"{{json .}}",
		...names,
	]);
	return parseDockerStats(output, names);
}

async function runHttpWorkload(
	url: string,
	requestCount: number,
	concurrency: number,
	signal: AbortSignal,
): Promise<HttpSummary> {
	let next = 0;
	let succeeded = 0;
	let failed = 0;
	const latencies: number[] = [];
	const workers = Array.from(
		{ length: Math.min(concurrency, requestCount) },
		async () => {
			while (true) {
				const index = next++;
				if (index >= requestCount || signal.aborted) return;
				const started = performance.now();
				try {
					const response = await fetch(url, { signal, redirect: "manual" });
					if (response.ok) succeeded++;
					else failed++;
					await response.body?.cancel();
				} catch {
					failed++;
				} finally {
					latencies.push(performance.now() - started);
				}
			}
		},
	);
	await Promise.all(workers);
	const latency = latencies.length > 0 ? summarize(latencies) : null;
	return {
		url,
		requests: requestCount,
		succeeded,
		failed,
		latencyMs: latency
			? { median: latency.median, p95: latency.p95, max: latency.max }
			: null,
	};
}

function outputPath(options: CliOptions, startedAt: string): string {
	if (options.output) return path.resolve(options.output);
	const stamp = startedAt.replace(/[:.]/g, "-");
	return path.resolve(
		"benchmark-results",
		"backend",
		`${stamp}-${options.label}.json`,
	);
}

function printSummary(
	summary: ReturnType<typeof aggregateSamples>,
	resultPath: string,
): void {
	console.log(
		"Container\tRAM median/p95/max MiB\tCPU median/p95/max %\tMax PIDs",
	);
	for (const [name, values] of Object.entries(summary.containers)) {
		console.log(
			`${name}\t${values.memoryUsageMiB.median.toFixed(1)}/${values.memoryUsageMiB.p95.toFixed(1)}/${values.memoryUsageMiB.max.toFixed(1)}\t${values.cpuPercent.median.toFixed(2)}/${values.cpuPercent.p95.toFixed(2)}/${values.cpuPercent.max.toFixed(2)}\t${values.maxPids}`,
		);
	}
	console.log(
		`TOTAL\t${summary.total.memoryUsageMiB.median.toFixed(1)}/${summary.total.memoryUsageMiB.p95.toFixed(1)}/${summary.total.memoryUsageMiB.max.toFixed(1)}\t${summary.total.cpuPercent.median.toFixed(2)}/${summary.total.cpuPercent.p95.toFixed(2)}/${summary.total.cpuPercent.max.toFixed(2)}\t${summary.total.maxPids}`,
	);
	console.log(`Result: ${resultPath}`);
}

async function main(): Promise<void> {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log(HELP);
		return;
	}

	const startedAt = new Date().toISOString();
	const resultPath = outputPath(options, startedAt);
	const controller = new AbortController();
	let interrupted = false;
	const interrupt = () => {
		interrupted = true;
		controller.abort();
	};
	process.on("SIGINT", interrupt);
	process.on("SIGTERM", interrupt);

	try {
		const dockerVersion = await runCommand([
			"docker",
			"version",
			"--format",
			"{{.Server.Version}}",
		]);
		const gitSha = await runCommand(["git", "rev-parse", "--short", "HEAD"]);
		const containerMetadata = await inspectContainers(options.containers);
		const httpPromise = options.url
			? runHttpWorkload(
					options.url,
					options.requests as number,
					options.concurrency as number,
					controller.signal,
				)
			: Promise.resolve(null);

		const samples: ResourceSample[] = [];
		const sampleCount = Math.max(
			1,
			Math.ceil(options.duration / options.interval),
		);
		for (let index = 0; index < sampleCount && !interrupted; index++) {
			const target = performance.now() + options.interval * 1000;
			samples.push(await collectSample(options.containers));
			const remaining = target - performance.now();
			if (remaining > 0 && index < sampleCount - 1) {
				await Bun.sleep(remaining);
			}
		}
		if (samples.length === 0)
			throw new Error("Recording ended before the first sample");

		const http = await httpPromise;
		const summary = aggregateSamples(samples);
		const result = {
			schemaVersion: 1,
			metadata: {
				startedAt,
				finishedAt: new Date().toISOString(),
				label: options.label,
				gitSha,
				platform: `${os.platform()}-${os.arch()}`,
				logicalCpus: os.cpus().length,
				hostTotalMemoryMiB: os.totalmem() / 1024 ** 2,
				dockerServerVersion: dockerVersion,
				durationSeconds: options.duration,
				intervalSeconds: options.interval,
				interrupted,
				containers: containerMetadata,
			},
			samples,
			summary,
			http,
		};
		await mkdir(path.dirname(resultPath), { recursive: true });
		await Bun.write(resultPath, `${JSON.stringify(result, null, 2)}\n`);
		printSummary(summary, resultPath);
		if (interrupted) process.exitCode = 130;
	} finally {
		process.off("SIGINT", interrupt);
		process.off("SIGTERM", interrupt);
	}
}

if (import.meta.main) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
