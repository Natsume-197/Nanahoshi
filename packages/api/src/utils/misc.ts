import { env } from "@nanahoshi-v2/env/server";
import { v5 as uuidv5 } from "uuid";
import { logger } from "../lib/logger";

const log = logger.child({ component: "misc" });

const SAMPLE_SIZE = 32 * 1024; // 32KB

// Previous scanner hashed only the file size. Kept so the scanner can recognize
// and re-hash those rows with the real content hash. Don't use for new rows.
export function legacySizeHash(size: number): string {
	const hasher = new Bun.CryptoHasher("blake2b256");
	hasher.update(new TextEncoder().encode(`${size}:`));
	return Array.from(hasher.digest())
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function toHex(digest: Uint8Array): string {
	return Array.from(digest)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// Content hash of an in-memory buffer, byte-for-byte identical to
// calculateContentHash() for the same content. Uploads hash here to dedupe
// before writing to disk.
export function hashContentBytes(bytes: Uint8Array): string {
	const size = bytes.byteLength;
	const hasher = new Bun.CryptoHasher("blake2b256");
	if (size <= SAMPLE_SIZE * 2) {
		hasher.update(bytes);
	} else {
		hasher.update(new TextEncoder().encode(`${size}`));
		hasher.update(bytes.subarray(0, SAMPLE_SIZE));
		hasher.update(bytes.subarray(size - SAMPLE_SIZE, size));
	}
	return toHex(hasher.digest());
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
			return toHex(hasher.digest());
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

		return toHex(hasher.digest());
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
