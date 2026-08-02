import { readFileSync } from "node:fs";
import os from "node:os";

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

function readOptional(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

const detectedCpuCapacity = cpuCapacityFrom({
	parallelism:
		typeof os.availableParallelism === "function"
			? os.availableParallelism()
			: os.cpus().length,
	cgroupV2CpuMax: readOptional("/sys/fs/cgroup/cpu.max"),
	cgroupV1Quota: readOptional("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"),
	cgroupV1Period: readOptional("/sys/fs/cgroup/cpu/cpu.cfs_period_us"),
});

const detectedWorkerCpuBudget =
	workerCpuBudgetFromCapacity(detectedCpuCapacity);

const cgroupV2MemoryMax = readOptional("/sys/fs/cgroup/memory.max");
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
	const cgroupUsage =
		positiveBytes(readOptional("/sys/fs/cgroup/memory.current")) ??
		positiveBytes(readOptional("/sys/fs/cgroup/memory/memory.usage_in_bytes"));
	return cgroupUsage ?? Math.max(0, os.totalmem() - os.freemem());
}
