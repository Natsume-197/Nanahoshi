import { env } from "@nanahoshi-v2/env/server";
import { v5 as uuidv5 } from "uuid";
import { logger } from "../lib/logger";

const log = logger.child({ component: "misc" });

const SAMPLE_SIZE = 32 * 1024; // 32KB

// Content hashes are SHA-256 via crypto.subtle, which runs on a native
// threadpool instead of blocking the JS thread like Bun.CryptoHasher. The
// prefix distinguishes current hashes from earlier formats (blake2b hex,
// size-only legacy) so the scanner can re-hash old rows in place.
const HASH_PREFIX = "s2:";

/** True when `hash` is in the current content-hash format. */
export function isCurrentHashFormat(hash: string): boolean {
	return hash.startsWith(HASH_PREFIX);
}

function toHex(digest: ArrayBuffer): string {
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

// Sampled-content digest: whole content for small files, otherwise
// size + first/last SAMPLE_SIZE bytes concatenated.
async function digestSampled(
	size: number,
	start: Uint8Array,
	end?: Uint8Array,
): Promise<string> {
	let input: Uint8Array;
	if (end === undefined) {
		input = start;
	} else {
		const sizeBytes = new TextEncoder().encode(`${size}`);
		input = new Uint8Array(sizeBytes.length + start.length + end.length);
		input.set(sizeBytes, 0);
		input.set(start, sizeBytes.length);
		input.set(end, sizeBytes.length + start.length);
	}
	const digest = await crypto.subtle.digest(
		"SHA-256",
		input as Uint8Array<ArrayBuffer>,
	);
	return HASH_PREFIX + toHex(digest);
}

// Content hash of an in-memory buffer, byte-for-byte identical to
// calculateContentHash() for the same content. Uploads hash here to dedupe
// before writing to disk.
export async function hashContentBytes(bytes: Uint8Array): Promise<string> {
	const size = bytes.byteLength;
	if (size <= SAMPLE_SIZE * 2) {
		return digestSampled(size, bytes);
	}
	return digestSampled(
		size,
		bytes.subarray(0, SAMPLE_SIZE),
		bytes.subarray(size - SAMPLE_SIZE, size),
	);
}

export async function calculateContentHash(
	fullPath: string,
	fileSize: number,
): Promise<string | null> {
	try {
		if (fileSize <= SAMPLE_SIZE * 2) {
			const buffer = await Bun.file(fullPath).arrayBuffer();
			return await digestSampled(fileSize, new Uint8Array(buffer));
		}

		const [start, end] = await Promise.all([
			Bun.file(fullPath).slice(0, SAMPLE_SIZE).arrayBuffer(),
			Bun.file(fullPath)
				.slice(fileSize - SAMPLE_SIZE, fileSize)
				.arrayBuffer(),
		]);

		return await digestSampled(
			fileSize,
			new Uint8Array(start),
			new Uint8Array(end),
		);
	} catch (err) {
		log.error({ err, fullPath }, "Content hash error");
		return null;
	}
}

export const generateDeterministicUUID = (
	filename: string,
	hash: string,
): string => {
	const input = `${filename}|${hash}`;
	return uuidv5(input, env.NAMESPACE_UUID);
};
