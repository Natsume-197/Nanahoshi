import { describe, expect, test } from "bun:test";
import {
	aggregateSamples,
	DEFAULT_CONTAINERS,
	parseArgs,
	parseBytes,
	parseCpuPercent,
	parseDockerStats,
	parseMemoryUsage,
	percentile,
	type ResourceSample,
} from "./backend-resource-baseline";

describe("parseArgs", () => {
	test("applies defaults", () => {
		expect(parseArgs(["--label=idle"])).toEqual({
			help: false,
			label: "idle",
			duration: 60,
			interval: 2,
			containers: [...DEFAULT_CONTAINERS],
		});
	});

	test("parses explicit recorder and HTTP workload options", () => {
		const options = parseArgs([
			"--label=health_burst",
			"--duration=30",
			"--interval=0.5",
			"--output=/tmp/result.json",
			"--containers=api,worker,api",
			"--url=http://localhost:3000/",
			"--requests=20",
			"--concurrency=4",
		]);
		expect(options.containers).toEqual(["api", "worker"]);
		expect(options.url).toBe("http://localhost:3000/");
		expect(options.requests).toBe(20);
		expect(options.concurrency).toBe(4);
	});

	test("help does not require a label", () => {
		expect(parseArgs(["--help"]).help).toBe(true);
	});

	test.each([
		[["--label=bad label"], "--label"],
		[["--label=x", "--duration=0"], "--duration"],
		[["--label=x", "--duration=1.5"], "--duration"],
		[["--label=x", "--interval=61"], "--interval"],
		[
			[
				"--label=x",
				"--url=ftp://example.com",
				"--requests=1",
				"--concurrency=1",
			],
			"HTTP",
		],
		[
			[
				"--label=x",
				"--url=http://user:pass@example.com",
				"--requests=1",
				"--concurrency=1",
			],
			"credentials",
		],
		[
			[
				"--label=x",
				"--url=http://localhost/?token=secret",
				"--requests=1",
				"--concurrency=1",
			],
			"query parameters",
		],
		[["--label=x", "--url=http://localhost"], "provided together"],
	] as const)("rejects invalid options %#", (args, message) => {
		expect(() => parseArgs([...args])).toThrow(message);
	});
});

describe("Docker value parsing", () => {
	test("normalizes binary byte units", () => {
		expect(parseBytes("1024B")).toBe(1024);
		expect(parseBytes("2KiB")).toBe(2048);
		expect(parseBytes("1.5MiB")).toBe(1.5 * 1024 ** 2);
		expect(parseBytes("2GiB")).toBe(2 * 1024 ** 3);
	});

	test("parses usage and limit in MiB", () => {
		expect(parseMemoryUsage("212.9MiB / 14.47GiB")).toEqual({
			usageMiB: 212.9,
			limitMiB: 14.47 * 1024,
		});
	});

	test("parses CPU percentages", () => {
		expect(parseCpuPercent("0.58%")).toBe(0.58);
		expect(() => parseCpuPercent("unknown")).toThrow("CPU");
	});
});

describe("percentiles and aggregation", () => {
	test("uses nearest-rank percentiles", () => {
		expect(percentile([], 0.5)).toBeNull();
		expect(percentile([7], 0.95)).toBe(7);
		expect(percentile([1, 2, 3], 0.5)).toBe(2);
		expect(percentile([1, 2, 3, 4], 0.5)).toBe(2);
		expect(percentile([1, 2, 3, 4, 100], 0.95)).toBe(100);
	});

	test("summarizes containers and stack totals", () => {
		const samples: ResourceSample[] = [1, 2, 3, 4, 5].map((factor) => ({
			timestamp: `2026-07-31T00:00:0${factor}.000Z`,
			containers: {
				api: {
					cpuPercent: factor,
					memoryUsageMiB: factor * 10,
					memoryLimitMiB: 100,
					pids: factor,
					netIO: "0B / 0B",
					blockIO: "0B / 0B",
				},
				worker: {
					cpuPercent: factor * 2,
					memoryUsageMiB: factor * 20,
					memoryLimitMiB: 200,
					pids: factor * 2,
					netIO: "0B / 0B",
					blockIO: "0B / 0B",
				},
				postgres: {
					cpuPercent: factor * 3,
					memoryUsageMiB: factor * 30,
					memoryLimitMiB: 300,
					pids: factor * 3,
					netIO: "0B / 0B",
					blockIO: "0B / 0B",
				},
			},
			total: {
				cpuPercent: factor * 6,
				memoryUsageMiB: factor * 60,
				pids: factor * 6,
			},
		}));
		const summary = aggregateSamples(samples);
		expect(summary.containers.api.memoryUsageMiB.median).toBe(30);
		expect(summary.containers.worker.cpuPercent.p95).toBe(10);
		expect(summary.total.memoryUsageMiB.max).toBe(300);
		expect(summary.total.maxPids).toBe(30);
	});

	test("rejects inconsistent samples", () => {
		const sample = parseDockerStats(
			'{"Name":"api","CPUPerc":"1.00%","MemUsage":"10MiB / 1GiB","PIDs":"2"}',
			["api"],
		);
		expect(() =>
			aggregateSamples([
				sample,
				{ ...sample, containers: { worker: sample.containers.api } },
			]),
		).toThrow("same containers");
	});

	test("rejects missing or duplicate Docker rows", () => {
		expect(() => parseDockerStats("", ["api"])).toThrow("every requested");
		const duplicate = [
			'{"Name":"api","CPUPerc":"1%","MemUsage":"1MiB / 1GiB","PIDs":"1"}',
			'{"Name":"api","CPUPerc":"1%","MemUsage":"1MiB / 1GiB","PIDs":"1"}',
		].join("\n");
		expect(() => parseDockerStats(duplicate, ["api"])).toThrow("duplicate");
	});
});
