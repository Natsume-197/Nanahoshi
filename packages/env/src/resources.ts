import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

type CpuCapacityInputs = {
	parallelism: number;
	cgroupV2CpuMax?: string;
	cgroupV1Quota?: string;
	cgroupV1Period?: string;
};

type MemoryCapacityInputs = {
	systemBytes: number;
	cgroupV2MemoryMax?: string;
	cgroupV1MemoryLimit?: string;
};

type MemoryUsageInputs = {
	systemBytes: number;
	systemAvailableBytes?: number;
	systemFreeBytes: number;
	cgroupUsageBytes?: number;
	cgroupLimitBytes?: number;
};

function positiveFloor(value: number): number {
	return Math.max(1, Math.floor(Number.isFinite(value) ? value : 1));
}

function quotaCapacity(
	quotaValue?: string,
	periodValue?: string,
): number | null {
	if (!quotaValue || !periodValue) return null;
	const quota = Number(quotaValue.trim());
	const period = Number(periodValue.trim());
	if (!Number.isFinite(quota) || !Number.isFinite(period)) return null;
	if (quota <= 0 || period <= 0) return null;
	return positiveFloor(quota / period);
}

function cgroupV2Capacity(value?: string): number | null {
	if (!value) return null;
	const [quota, period] = value.trim().split(/\s+/);
	if (!quota || quota === "max") return null;
	return quotaCapacity(quota, period);
}

function positiveBytes(value?: string): number | null {
	if (!value || value.trim() === "max") return null;
	const bytes = Number(value.trim());
	if (!Number.isFinite(bytes) || bytes <= 0) return null;
	return Math.floor(bytes);
}

function positiveNumberBytes(value?: number): number | null {
	if (value === undefined || !Number.isFinite(value) || value <= 0) return null;
	return Math.floor(value);
}

/** Parse the unified cgroup entry for this process. */
export function cgroupV2PathFrom(contents?: string): string | null {
	if (!contents) return null;
	for (const line of contents.split(/\r?\n/)) {
		const match = /^0::(\/.*)$/.exec(line.trim());
		if (match?.[1]) return path.posix.normalize(match[1]);
	}
	return null;
}

/** Resolve the CPUs this process may actually consume, including cgroup caps. */
export function cpuCapacityFrom(inputs: CpuCapacityInputs): number {
	const limits = [
		positiveFloor(inputs.parallelism),
		cgroupV2Capacity(inputs.cgroupV2CpuMax),
		quotaCapacity(inputs.cgroupV1Quota, inputs.cgroupV1Period),
	].filter((value): value is number => value !== null);
	return Math.min(...limits);
}

/**
 * Use most of the machine while keeping roughly one quarter available for the
 * API, database, Redis, desktop and operating system.
 */
export function workerCpuBudgetFromCapacity(cpuCapacity: number): number {
	return Math.max(1, Math.floor(positiveFloor(cpuCapacity) * 0.75));
}

/** Resolve usable RAM, honoring Docker/Kubernetes cgroup ceilings. */
export function memoryCapacityFrom(inputs: MemoryCapacityInputs): number {
	const systemBytes = Math.max(1, Math.floor(inputs.systemBytes));
	const limits = [
		systemBytes,
		positiveBytes(inputs.cgroupV2MemoryMax),
		positiveBytes(inputs.cgroupV1MemoryLimit),
	].filter((value): value is number => value !== null);
	return Math.min(...limits);
}

/**
 * Resolve non-reclaimable memory pressure from a matched capacity/usage pair.
 * An unbounded cgroup cannot be compared with host capacity, so host
 * MemAvailable is authoritative in that case (it includes reclaimable cache).
 */
export function memoryUsageFrom(inputs: MemoryUsageInputs): number {
	const cgroupLimit = positiveNumberBytes(inputs.cgroupLimitBytes);
	const cgroupUsage = positiveNumberBytes(inputs.cgroupUsageBytes);
	if (cgroupLimit !== null && cgroupUsage !== null) {
		return Math.min(cgroupUsage, cgroupLimit);
	}

	const systemBytes = Math.max(1, Math.floor(inputs.systemBytes));
	const available = Math.min(
		systemBytes,
		Math.max(
			0,
			Math.floor(inputs.systemAvailableBytes ?? inputs.systemFreeBytes),
		),
	);
	return systemBytes - available;
}

function readOptional(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

const cgroupV2Path = cgroupV2PathFrom(readOptional("/proc/self/cgroup"));

function cgroupV2File(name: string): string {
	const relative = cgroupV2Path?.replace(/^\/+/, "") ?? "";
	return path.join("/sys/fs/cgroup", relative, name);
}

function systemAvailableMemory(): number | undefined {
	const meminfo = readOptional("/proc/meminfo");
	const kib = meminfo
		? Number(/^MemAvailable:\s+(\d+)\s+kB$/m.exec(meminfo)?.[1])
		: Number.NaN;
	return Number.isFinite(kib) && kib >= 0 ? kib * 1024 : undefined;
}

const detectedCpuCapacity = cpuCapacityFrom({
	parallelism:
		typeof os.availableParallelism === "function"
			? os.availableParallelism()
			: os.cpus().length,
	cgroupV2CpuMax: readOptional(cgroupV2File("cpu.max")),
	cgroupV1Quota: readOptional("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"),
	cgroupV1Period: readOptional("/sys/fs/cgroup/cpu/cpu.cfs_period_us"),
});

const detectedWorkerCpuBudget =
	workerCpuBudgetFromCapacity(detectedCpuCapacity);

const cgroupV2MemoryMax = readOptional(cgroupV2File("memory.max"));
const cgroupV1MemoryLimit = readOptional(
	"/sys/fs/cgroup/memory/memory.limit_in_bytes",
);
const detectedMemoryCapacity = memoryCapacityFrom({
	systemBytes: os.totalmem(),
	cgroupV2MemoryMax,
	cgroupV1MemoryLimit,
});

export function runtimeCpuCapacity(): number {
	return detectedCpuCapacity;
}

export function runtimeWorkerCpuBudget(): number {
	return detectedWorkerCpuBudget;
}

export function runtimeMemoryCapacity(): number {
	return detectedMemoryCapacity;
}

/** Current cgroup usage includes child processes such as Calibre and codecs. */
export function runtimeMemoryUsage(): number {
	return memoryUsageFrom({
		systemBytes: os.totalmem(),
		systemAvailableBytes: systemAvailableMemory(),
		systemFreeBytes: os.freemem(),
		cgroupUsageBytes:
			positiveBytes(readOptional(cgroupV2File("memory.current"))) ??
			positiveBytes(
				readOptional("/sys/fs/cgroup/memory/memory.usage_in_bytes"),
			) ??
			undefined,
		cgroupLimitBytes:
			positiveBytes(cgroupV2MemoryMax) ??
			positiveBytes(cgroupV1MemoryLimit) ??
			undefined,
	});
}
