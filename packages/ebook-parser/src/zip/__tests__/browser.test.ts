import { describe, expect, it } from "bun:test";
import { openZip, ZipFormatError } from "../browser";
import { buildZip, bytes } from "./zip-fixture";

const readBytes = async (blob: Blob | undefined) =>
	new Uint8Array((await blob?.arrayBuffer()) as ArrayBuffer);

describe("openZip", () => {
	it("reads stored entries", async () => {
		const zip = await openZip(
			buildZip([
				{ name: "a.txt", data: bytes("hello") },
				{ name: "b/c.txt", data: bytes("nested") },
			]),
		);

		expect(zip.has("a.txt")).toBe(true);
		expect(await zip.text("a.txt")).toBe("hello");
		expect(await zip.text("b/c.txt")).toBe("nested");
	});

	it("reads deflated entries", async () => {
		const body = "あ".repeat(5000);
		const zip = await openZip(
			buildZip([{ name: "a.txt", data: bytes(body), deflate: true }]),
		);

		expect(await zip.text("a.txt")).toBe(body);
	});

	it("returns binary entries as blobs with the requested type", async () => {
		const data = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a]);
		const zip = await openZip(buildZip([{ name: "i.jpg", data }]));

		const blob = await zip.blob("i.jpg", "image/jpeg");
		expect(blob?.type).toBe("image/jpeg");
		expect(await readBytes(blob)).toEqual(data);
	});

	it("round-trips binary data through the deflate path", async () => {
		const data = new Uint8Array(4096).map((_, i) => i % 7);
		const zip = await openZip(
			buildZip([{ name: "i.bin", data, deflate: true }]),
		);

		expect(await readBytes(await zip.blob("i.bin", "image/png"))).toEqual(data);
	});

	it("mixes stored and deflated entries in one archive", async () => {
		const zip = await openZip(
			buildZip([
				{ name: "stored.txt", data: bytes("plain") },
				{ name: "deflated.txt", data: bytes("x".repeat(2000)), deflate: true },
			]),
		);

		expect(await zip.text("stored.txt")).toBe("plain");
		expect(await zip.text("deflated.txt")).toBe("x".repeat(2000));
	});

	it("strips a UTF-8 BOM from text entries", async () => {
		const data = new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("<?xml?>")]);
		const zip = await openZip(buildZip([{ name: "x.xml", data }]));

		expect(await zip.text("x.xml")).toBe("<?xml?>");
	});

	it("decodes non-ASCII entry names as UTF-8", async () => {
		const zip = await openZip(
			buildZip([{ name: "画像/表紙.txt", data: bytes("cover") }]),
		);

		expect(zip.has("画像/表紙.txt")).toBe(true);
		expect(await zip.text("画像/表紙.txt")).toBe("cover");
	});

	it("lists entry names in central-directory order", async () => {
		const zip = await openZip(
			buildZip([
				{ name: "a.txt", data: bytes("1") },
				{ name: "b.txt", data: bytes("2") },
			]),
		);

		expect(zip.names()).toEqual(["a.txt", "b.txt"]);
	});

	it("reports missing entries rather than throwing", async () => {
		const zip = await openZip(buildZip([{ name: "a.txt", data: bytes("1") }]));

		expect(zip.has("nope.txt")).toBe(false);
		expect(await zip.text("nope.txt")).toBeUndefined();
		expect(await zip.blob("nope.txt", "image/jpeg")).toBeUndefined();
	});

	it("finds the central directory behind an archive comment", async () => {
		// A comment pushes the EOCD away from the file end, so the reader has to
		// scan backwards for the signature instead of reading the last 22 bytes.
		const zip = await openZip(
			buildZip([{ name: "a.txt", data: bytes("hello") }], {
				comment: bytes("x".repeat(300)),
			}),
		);

		expect(await zip.text("a.txt")).toBe("hello");
	});

	it("reads ZIP64 archives via the extra field", async () => {
		// Classic size/offset fields saturated; the real values live in the
		// per-entry ZIP64 extra field and the ZIP64 EOCD record.
		const zip = await openZip(
			buildZip(
				[
					{ name: "a.txt", data: bytes("hello") },
					{ name: "b.txt", data: bytes("y".repeat(3000)), deflate: true },
				],
				{ zip64: true },
			),
		);

		expect(await zip.text("a.txt")).toBe("hello");
		expect(await zip.text("b.txt")).toBe("y".repeat(3000));
	});

	it("rejects a file that is not a ZIP", async () => {
		await expect(
			openZip(new Blob(["not a zip at all"])),
		).rejects.toBeInstanceOf(ZipFormatError);
	});

	it("rejects an empty file", async () => {
		await expect(openZip(new Blob([]))).rejects.toBeInstanceOf(ZipFormatError);
	});

	it("rejects an unsupported compression method", async () => {
		const archive = buildZip([{ name: "a.txt", data: bytes("hello") }]);
		const raw = new Uint8Array(await archive.arrayBuffer());
		// Method 12 (bzip2) in both the local header and the central record.
		new DataView(raw.buffer).setUint16(8, 12, true);
		for (let i = raw.length - 22; i >= 0; i -= 1) {
			if (new DataView(raw.buffer).getUint32(i, true) === 0x02014b50) {
				new DataView(raw.buffer).setUint16(i + 10, 12, true);
				break;
			}
		}

		const zip = await openZip(new Blob([raw]));
		await expect(zip.text("a.txt")).rejects.toBeInstanceOf(ZipFormatError);
	});
});
