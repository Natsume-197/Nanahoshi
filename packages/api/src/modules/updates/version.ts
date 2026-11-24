// Release versions are the Git tags the release workflow accepts:
// `v<major>.<minor>.<patch>` with an optional `-<prerelease>` suffix.
// Pure module: the updater sidecar bundles it too.

export interface ParsedVersion {
	major: number;
	minor: number;
	patch: number;
	prerelease: string[];
}

const VERSION_PATTERN =
	/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseVersion(value: string | null | undefined) {
	const match = value?.trim().match(VERSION_PATTERN);
	if (!match) return null;
	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4] ? match[4].split(".") : [],
	} satisfies ParsedVersion;
}

function compareIdentifiers(a: string, b: string) {
	const aNumeric = /^\d+$/.test(a);
	const bNumeric = /^\d+$/.test(b);
	if (aNumeric && bNumeric) return Math.sign(Number(a) - Number(b));
	if (aNumeric) return -1;
	if (bNumeric) return 1;
	return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Semantic version precedence: negative when `a` is older than `b`, positive
 * when newer, 0 when equal. `null` when either side is not a release version
 * (a development build), so callers never guess an order.
 */
export function compareVersions(a: string, b: string): number | null {
	const left = parseVersion(a);
	const right = parseVersion(b);
	if (!left || !right) return null;
	for (const key of ["major", "minor", "patch"] as const) {
		if (left[key] !== right[key]) return Math.sign(left[key] - right[key]);
	}
	// A release without a prerelease suffix ranks above its prereleases.
	if (left.prerelease.length === 0 || right.prerelease.length === 0) {
		return Math.sign(right.prerelease.length - left.prerelease.length);
	}
	const length = Math.max(left.prerelease.length, right.prerelease.length);
	for (let index = 0; index < length; index++) {
		const a = left.prerelease[index];
		const b = right.prerelease[index];
		if (a === undefined) return -1;
		if (b === undefined) return 1;
		const order = compareIdentifiers(a, b);
		if (order !== 0) return order;
	}
	return 0;
}

export function isNewerVersion(candidate: string, current: string) {
	return (compareVersions(candidate, current) ?? 0) > 0;
}

export function isPrerelease(value: string) {
	return (parseVersion(value)?.prerelease.length ?? 0) > 0;
}

/** The release this build was published as, or "development". */
export function runningRelease(): string {
	const value = process.env.NANAHOSHI_RELEASE?.trim();
	return value && parseVersion(value) ? value : "development";
}
