import { describe, expect, it } from "bun:test";
import { fitImageWidth, getImageDimensions } from "../image-dimensions";

function blobFrom(bytes: number[]): Blob {
	return new Blob([new Uint8Array(bytes)]);
}

function ascii(text: string): number[] {
	return Array.from(text, (char) => char.charCodeAt(0));
}

function uint16BE(value: number): number[] {
	return [(value >> 8) & 0xff, value & 0xff];
}

function uint16LE(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff];
}

function uint32BE(value: number): number[] {
	return [
		(value >>> 24) & 0xff,
		(value >> 16) & 0xff,
		(value >> 8) & 0xff,
		value & 0xff,
	];
}

function uint32LE(value: number): number[] {
	return [
		value & 0xff,
		(value >> 8) & 0xff,
		(value >> 16) & 0xff,
		(value >>> 24) & 0xff,
	];
}

function uint24LE(value: number): number[] {
	return [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff];
}

describe("getImageDimensions", () => {
	it("parses PNG headers", async () => {
		const png = [
			0x89,
			...ascii("PNG"),
			0x0d,
			0x0a,
			0x1a,
			0x0a,
			...uint32BE(13),
			...ascii("IHDR"),
			...uint32BE(800),
			...uint32BE(1200),
		];
		expect(await getImageDimensions(blobFrom(png))).toEqual({
			width: 800,
			height: 1200,
		});
	});

	it("parses JPEG headers, skipping leading segments", async () => {
		const jpeg = [
			0xff,
			0xd8, // SOI
			0xff,
			0xe1,
			...uint16BE(4),
			0x00,
			0x00, // APP1 segment with 2 payload bytes
			0xff,
			0xc0,
			...uint16BE(11),
			0x08, // SOF0, 8-bit precision
			...uint16BE(1200), // height
			...uint16BE(800), // width
			0x03,
			0x00,
			0x00,
			0x00,
		];
		expect(await getImageDimensions(blobFrom(jpeg))).toEqual({
			width: 800,
			height: 1200,
		});
	});

	it("parses GIF headers", async () => {
		const gif = [
			...ascii("GIF89a"),
			...uint16LE(320),
			...uint16LE(240),
			0x00,
			0x00,
		];
		expect(await getImageDimensions(blobFrom(gif))).toEqual({
			width: 320,
			height: 240,
		});
	});

	it("parses lossy WebP (VP8) headers", async () => {
		const webp = [
			...ascii("RIFF"),
			...uint32LE(22),
			...ascii("WEBP"),
			...ascii("VP8 "),
			...uint32LE(10),
			0x00,
			0x00,
			0x00, // frame tag
			0x9d,
			0x01,
			0x2a, // keyframe start code
			...uint16LE(800),
			...uint16LE(1200),
		];
		expect(await getImageDimensions(blobFrom(webp))).toEqual({
			width: 800,
			height: 1200,
		});
	});

	it("parses lossless WebP (VP8L) headers", async () => {
		const bits = (800 - 1) | ((1200 - 1) << 14);
		const webp = [
			...ascii("RIFF"),
			...uint32LE(18),
			...ascii("WEBP"),
			...ascii("VP8L"),
			...uint32LE(6),
			0x2f,
			...uint32LE(bits),
			0x00,
		];
		expect(await getImageDimensions(blobFrom(webp))).toEqual({
			width: 800,
			height: 1200,
		});
	});

	it("parses extended WebP (VP8X) headers", async () => {
		const webp = [
			...ascii("RIFF"),
			...uint32LE(22),
			...ascii("WEBP"),
			...ascii("VP8X"),
			...uint32LE(10),
			0x00,
			0x00,
			0x00,
			0x00, // flags + reserved
			...uint24LE(800 - 1),
			...uint24LE(1200 - 1),
		];
		expect(await getImageDimensions(blobFrom(webp))).toEqual({
			width: 800,
			height: 1200,
		});
	});

	it("returns undefined for unknown or truncated data", async () => {
		expect(await getImageDimensions(blobFrom(ascii("not an image")))).toBe(
			undefined,
		);
		expect(
			await getImageDimensions(
				blobFrom([0x89, ...ascii("PNG"), 0x0d, 0x0a, 0x1a, 0x0a]),
			),
		).toBe(undefined);
		expect(await getImageDimensions(blobFrom([]))).toBe(undefined);
	});
});

describe("fitImageWidth", () => {
	it("keeps the natural width when the image fits", () => {
		expect(fitImageWidth({ width: 800, height: 600 }, 1080)).toBe(800);
	});

	it("scales the width down proportionally when too tall", () => {
		expect(fitImageWidth({ width: 1600, height: 2400 }, 1200)).toBe(800);
	});

	it("never returns less than 1px", () => {
		expect(fitImageWidth({ width: 1, height: 10000 }, 100)).toBe(1);
	});
});
