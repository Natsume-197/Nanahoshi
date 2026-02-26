import { env } from "@nanahoshi-v2/env/server";
import type { Stats } from "fs";
import { v5 as uuidv5 } from "uuid";

const SAMPLE_SIZE = 32 * 1024; // 32KB

// We use the file size as the initial hash key because it's the only reliable and fast-to-obtain property.
// This hash is just a preliminary filter, it will produce false positives for files with identical sizes.
// Those cases will be resolved later by computing a full content hash.
export function calculateMetadataHash(stats: Stats): string {
	const key = `${stats.size}:`;
	const hasher = new Bun.CryptoHasher("blake2b256");
	hasher.update(new TextEncoder().encode(key));
	return Array.from(hasher.digest())
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

export async function calculateContentHash(
	fullPath: string,
	fileSize: number,
): Promise<string | null> {
	try {
		if (fileSize <= SAMPLE_SIZE * 2) {
			const buffer = await Bun.file(fullPath).arrayBuffer();
			const hasher = new Bun.CryptoHasher("blake2b256");
			hasher.update(new Uint8Array(buffer));
			return Array.from(hasher.digest())
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");
		}

		const [start, end] = await Promise.all([
			Bun.file(fullPath).slice(0, SAMPLE_SIZE).arrayBuffer(),
			Bun.file(fullPath)
				.slice(fileSize - SAMPLE_SIZE, fileSize)
				.arrayBuffer(),
		]);

		const hasher = new Bun.CryptoHasher("blake2b256");
		hasher.update(new TextEncoder().encode(`${fileSize}`));
		hasher.update(new Uint8Array(start));
		hasher.update(new Uint8Array(end));

		return Array.from(hasher.digest())
			.map((b) => b.toString(16).padStart(2, "0"))
			.join("");
	} catch (err) {
		console.error(err);
		console.error(`Content hash error: ${fullPath}`);
		return null;
	}
}

export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 Bytes";
	const k = 1024;
	const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}

export const generateDeterministicUUID = (
	filename: string,
	hash: string,
): string => {
	const input = `${filename}|${hash}`;
	return uuidv5(input, env.NAMESPACE_UUID);
};
