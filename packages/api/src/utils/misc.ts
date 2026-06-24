import { env } from "@nanahoshi-v2/env/server";
import { v5 as uuidv5 } from "uuid";
import { logger } from "../lib/logger";

const log = logger.child({ component: "misc" });

const SAMPLE_SIZE = 32 * 1024; // 32KB

// The previous scanner stored a hash derived only from the file size. Kept so
// the scanner can recognize rows created by that scheme and re-hash them with
// the real content hash. Do not use for new rows.
export function legacySizeHash(size: number): string {
	const hasher = new Bun.CryptoHasher("blake2b256");
	hasher.update(new TextEncoder().encode(`${size}:`));
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
		log.error({ err, fullPath }, "Content hash error");
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
