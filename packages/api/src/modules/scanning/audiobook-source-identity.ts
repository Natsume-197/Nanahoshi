import { createHash } from "node:crypto";

type AudiobookSourceIdentity = {
	filename: string;
	hash: string;
};

export function compareAudiobookSources(
	left: AudiobookSourceIdentity,
	right: AudiobookSourceIdentity,
): number {
	if (left.filename !== right.filename) {
		return left.filename < right.filename ? -1 : 1;
	}
	if (left.hash === right.hash) return 0;
	return left.hash < right.hash ? -1 : 1;
}

export function createAudiobookSourceFingerprint(
	sources: AudiobookSourceIdentity[],
): string {
	const orderedIdentity = [...sources]
		.sort(compareAudiobookSources)
		.map(({ filename, hash }, index) => ({ index, filename, hash }));
	return createHash("sha256")
		.update(JSON.stringify(orderedIdentity))
		.digest("hex");
}
