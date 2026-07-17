import { describe, expect, mock, test } from "bun:test";

// ─── Mock: env ───────────────────────────────────────────────────────────────
// urlSigner reads DOWNLOAD_SECRET at module load time; mock env before import.

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DOWNLOAD_SECRET: "test-secret-for-unit-tests",
		SERVER_URL: "http://localhost:3000",
	},
}));

// ─── Module under test (dynamic import after mock) ───────────────────────────

const {
	generateAudioFileDownloadUrl,
	generateSignedPath,
	generateSeriesDownloadUrl,
	verifyAudioFileSignature,
	verifySignature,
	verifySeriesSignature,
} = await import("../urlSigner");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseSignedPath(path: string): { exp: number; sig: string } {
	const url = new URL(path, "http://localhost");
	return {
		exp: Number(url.searchParams.get("exp")),
		sig: url.searchParams.get("sig") as string,
	};
}

function parseSignedUrl(fullUrl: string): { exp: number; sig: string } {
	const url = new URL(fullUrl);
	return {
		exp: Number(url.searchParams.get("exp")),
		sig: url.searchParams.get("sig") as string,
	};
}

function tamper(sig: string): string {
	// Flip the first hex char: '0'→'1', everything else → '0'
	const flipped = sig[0] === "0" ? "1" : "0";
	return flipped + sig.slice(1);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

const TEST_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("verifySignature", () => {
	test("valid signature verifies true", () => {
		const path = generateSignedPath(TEST_UUID);
		const { exp, sig } = parseSignedPath(path);
		expect(verifySignature(TEST_UUID, exp, sig)).toBe(true);
	});

	test("tampered signature verifies false", () => {
		const path = generateSignedPath(TEST_UUID);
		const { exp, sig } = parseSignedPath(path);
		expect(verifySignature(TEST_UUID, exp, tamper(sig))).toBe(false);
	});

	test("signature for one uuid does not verify for a different uuid", () => {
		const otherUuid = "00000000-0000-0000-0000-000000000001";
		const path = generateSignedPath(TEST_UUID);
		const { exp, sig } = parseSignedPath(path);
		expect(verifySignature(otherUuid, exp, sig)).toBe(false);
	});

	test("expired exp verifies false regardless of sig correctness", () => {
		const path = generateSignedPath(TEST_UUID);
		const { sig } = parseSignedPath(path);
		expect(verifySignature(TEST_UUID, 1, sig)).toBe(false);
	});

	test("sig of wrong length verifies false and does not throw", () => {
		const path = generateSignedPath(TEST_UUID);
		const { exp } = parseSignedPath(path);
		expect(() => verifySignature(TEST_UUID, exp, "abc")).not.toThrow();
		expect(verifySignature(TEST_UUID, exp, "abc")).toBe(false);
	});
});

describe("verifyAudioFileSignature", () => {
	test("accepts a signature from generateAudioFileDownloadUrl", () => {
		const url = generateAudioFileDownloadUrl(TEST_UUID, 2);
		const { exp, sig } = parseSignedUrl(url);
		expect(verifyAudioFileSignature(TEST_UUID, 2, exp, sig)).toBe(true);
	});

	test("rejects the signature for a different file index", () => {
		const url = generateAudioFileDownloadUrl(TEST_UUID, 2);
		const { exp, sig } = parseSignedUrl(url);
		expect(verifyAudioFileSignature(TEST_UUID, 3, exp, sig)).toBe(false);
	});

	test("rejects a whole-book signature replayed against a file", () => {
		const bookPath = generateSignedPath(TEST_UUID);
		const { exp, sig } = parseSignedPath(bookPath);
		expect(verifyAudioFileSignature(TEST_UUID, 0, exp, sig)).toBe(false);
	});

	test("a file signature does not verify as a whole-book signature", () => {
		const url = generateAudioFileDownloadUrl(TEST_UUID, 0);
		const { exp, sig } = parseSignedUrl(url);
		expect(verifySignature(TEST_UUID, exp, sig)).toBe(false);
	});
});

describe("verifySeriesSignature", () => {
	const SERIES_NAME = "My Test Series";

	test("accepts a signature from generateSeriesDownloadUrl", () => {
		const url = generateSeriesDownloadUrl(SERIES_NAME);
		const { exp, sig } = parseSignedUrl(url);
		expect(verifySeriesSignature(SERIES_NAME, exp, sig)).toBe(true);
	});

	test("rejects a book-uuid signature replayed against the series endpoint", () => {
		const bookPath = generateSignedPath(TEST_UUID);
		const { exp, sig } = parseSignedPath(bookPath);
		// Use same exp but book sig — domain separation via "series:" prefix should reject
		expect(verifySeriesSignature(SERIES_NAME, exp, sig)).toBe(false);
	});
});
