import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import SevenZip from "7z-wasm";
import { openEbookFile } from "../node";
import { buildPdfFixture } from "../pdf/__tests__/pdf-fixture";
import { buildZip, bytes } from "../zip/__tests__/zip-fixture";

const fb2 = `<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
  <description><title-info><book-title>Node FB2</book-title><lang>en</lang></title-info><document-info><id>node-fb2</id></document-info></description>
  <body><section id="chapter"><title><p>Chapter</p></title><p>Content</p></section></body>
</FictionBook>`;

let directory = "";

beforeAll(async () => {
	directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "nanahoshi-ebook-parser-"),
	);
});

afterAll(async () => {
	if (directory) await fs.rm(directory, { recursive: true, force: true });
});

describe("openEbookFile", () => {
	test("opens plain and zipped FB2 files through the Node entry", async () => {
		const plainPath = path.join(directory, "fixture.fb2");
		const zipPath = path.join(directory, "fixture.fb2.zip");
		await fs.writeFile(plainPath, bytes(fb2));
		const zipped = buildZip([
			{ name: "fixture.fb2", data: bytes(fb2), deflate: true },
		]);
		await fs.writeFile(zipPath, new Uint8Array(await zipped.arrayBuffer()));

		const plain = await openEbookFile(plainPath);
		const compressed = await openEbookFile(zipPath);
		expect(plain.metadata.title).toBe("Node FB2");
		expect(compressed.metadata.title).toBe("Node FB2");
		expect(compressed.format).toBe("fb2");
	});

	test("opens CBZ and CB7 comic archives through the Node entry", async () => {
		const page2 = Uint8Array.of(2, 2);
		const page10 = Uint8Array.of(10, 10);
		const cbzPath = path.join(directory, "fixture.cbz");
		const cb7Path = path.join(directory, "fixture.cb7");
		const cbz = buildZip([
			{ name: "page10.jpg", data: page10 },
			{ name: "page2.png", data: page2 },
		]);
		await fs.writeFile(cbzPath, new Uint8Array(await cbz.arrayBuffer()));

		const sevenZip = await SevenZip({ print() {}, printErr() {} });
		sevenZip.FS.writeFile("page10.jpg", page10);
		sevenZip.FS.writeFile("page2.png", page2);
		sevenZip.callMain(["a", "fixture.cb7", "page10.jpg", "page2.png"]);
		await fs.writeFile(cb7Path, sevenZip.FS.readFile("fixture.cb7"));

		for (const [filePath, format] of [
			[cbzPath, "cbz"],
			[cb7Path, "cb7"],
		] as const) {
			const comic = await openEbookFile(filePath);
			expect(comic.format).toBe(format);
			if (comic.content.kind !== "pages") throw new Error("Expected pages");
			expect(comic.content.pages.map(({ id }) => id)).toEqual([
				"page2.png",
				"page10.jpg",
			]);
			expect((await comic.openCover())?.data).toEqual(page2);
			await comic.close();
		}
	});

	test("opens PDF metadata and renders its first page through the Node entry", async () => {
		const pdfPath = path.join(directory, "fixture.pdf");
		await fs.writeFile(pdfPath, buildPdfFixture());

		const pdf = await openEbookFile(pdfPath);
		expect(pdf.metadata.title).toBe("Fixture PDF");
		if (pdf.content.kind !== "pages") throw new Error("Expected pages");
		expect(pdf.content.pages).toHaveLength(1);
		const cover = await pdf.openCover();
		expect(cover?.mediaType).toBe("image/png");
		expect(cover?.data.slice(0, 8)).toEqual(
			Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
		);
		if (!cover) throw new Error("Expected a PDF cover");
		const image = await loadImage(Buffer.from(cover.data));
		const canvas = createCanvas(image.width, image.height);
		const context = canvas.getContext("2d");
		context.drawImage(image, 0, 0);
		const pixels = context.getImageData(0, 0, image.width, image.height).data;
		let containsInk = false;
		for (let index = 0; index < pixels.length; index += 4) {
			if (
				(pixels[index + 3] ?? 0) > 0 &&
				Math.min(
					pixels[index] ?? 255,
					pixels[index + 1] ?? 255,
					pixels[index + 2] ?? 255,
				) < 245
			) {
				containsInk = true;
				break;
			}
		}
		expect(containsInk).toBe(true);
		await pdf.close();
	});
});
