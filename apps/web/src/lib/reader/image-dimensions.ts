/**
 * Natural image dimensions read from container headers, without decoding the
 * image. Used to reserve layout space for book images before their blob URLs
 * load, so late image loads don't shift the restored reading position.
 */

export interface ImageDimensions {
	width: number;
	height: number;
}

/** JPEG SOF markers can sit behind large EXIF/thumbnail segments. */
const HEADER_BYTE_LIMIT = 512 * 1024;

export async function getImageDimensions(
	blob: Blob,
): Promise<ImageDimensions | undefined> {
	try {
		const view = new DataView(
			await blob.slice(0, HEADER_BYTE_LIMIT).arrayBuffer(),
		);
		return (
			parsePng(view) ?? parseJpeg(view) ?? parseGif(view) ?? parseWebp(view)
		);
	} catch {
		return undefined;
	}
}

/**
 * Width the reader will render the image at: the natural width scaled down
 * proportionally when the natural height exceeds the reader's height cap
 * (mirrors the `max-height` rules in reader.css so the cap never engages
 * and distorts an image whose `width` attribute is set).
 */
export function fitImageWidth(
	dimensions: ImageDimensions,
	fitHeight: number,
): number {
	if (dimensions.height <= fitHeight) return dimensions.width;
	return Math.max(
		1,
		Math.round((dimensions.width * fitHeight) / dimensions.height),
	);
}

/** Re-fit reserved image widths after the viewport height cap changes. */
export function refitImageWidths(root: HTMLElement, fitHeight: number): void {
	for (const imgEl of Array.from(
		root.querySelectorAll("img[data-ttu-natural-width]"),
	)) {
		const width = Number(imgEl.getAttribute("data-ttu-natural-width"));
		const height = Number(imgEl.getAttribute("data-ttu-natural-height"));
		if (!width || !height) continue;
		imgEl.setAttribute(
			"width",
			String(fitImageWidth({ width, height }, fitHeight)),
		);
	}
}

function isValid(dimensions: ImageDimensions): ImageDimensions | undefined {
	return dimensions.width > 0 && dimensions.height > 0 ? dimensions : undefined;
}

function parsePng(view: DataView): ImageDimensions | undefined {
	if (view.byteLength < 24) return undefined;
	if (view.getUint32(0) !== 0x89504e47 || view.getUint32(4) !== 0x0d0a1a0a) {
		return undefined;
	}
	return isValid({ width: view.getUint32(16), height: view.getUint32(20) });
}

function parseJpeg(view: DataView): ImageDimensions | undefined {
	if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return undefined;

	let offset = 2;
	while (offset + 9 < view.byteLength) {
		if (view.getUint8(offset) !== 0xff) return undefined;
		const marker = view.getUint8(offset + 1);

		if (marker === 0xff) {
			offset += 1; // fill byte
			continue;
		}
		if (marker >= 0xd0 && marker <= 0xd9) {
			offset += 2; // RST/SOI/EOI markers carry no length field
			continue;
		}

		const isSof =
			marker >= 0xc0 &&
			marker <= 0xcf &&
			marker !== 0xc4 &&
			marker !== 0xc8 &&
			marker !== 0xcc;
		if (isSof) {
			return isValid({
				width: view.getUint16(offset + 7),
				height: view.getUint16(offset + 5),
			});
		}

		offset += 2 + view.getUint16(offset + 2);
	}
	return undefined;
}

function parseGif(view: DataView): ImageDimensions | undefined {
	if (view.byteLength < 10 || view.getUint32(0) !== 0x47494638) {
		return undefined;
	}
	return isValid({
		width: view.getUint16(6, true),
		height: view.getUint16(8, true),
	});
}

function getUint24LE(view: DataView, offset: number): number {
	return (
		view.getUint8(offset) |
		(view.getUint8(offset + 1) << 8) |
		(view.getUint8(offset + 2) << 16)
	);
}

function parseWebp(view: DataView): ImageDimensions | undefined {
	if (view.byteLength < 25) return undefined;
	if (view.getUint32(0) !== 0x52494646 || view.getUint32(8) !== 0x57454250) {
		return undefined;
	}

	const chunk = view.getUint32(12);

	// "VP8 " (lossy): dimensions follow the keyframe start code
	if (chunk === 0x56503820) {
		if (view.byteLength < 30) return undefined;
		if (
			view.getUint8(23) !== 0x9d ||
			view.getUint8(24) !== 0x01 ||
			view.getUint8(25) !== 0x2a
		) {
			return undefined;
		}
		return isValid({
			width: view.getUint16(26, true) & 0x3fff,
			height: view.getUint16(28, true) & 0x3fff,
		});
	}

	// "VP8L" (lossless): 14-bit dimensions packed after the signature byte
	if (chunk === 0x5650384c) {
		if (view.getUint8(20) !== 0x2f) return undefined;
		const bits = view.getUint32(21, true);
		return isValid({
			width: (bits & 0x3fff) + 1,
			height: ((bits >> 14) & 0x3fff) + 1,
		});
	}

	// "VP8X" (extended): 24-bit canvas size minus one
	if (chunk === 0x56503858) {
		if (view.byteLength < 30) return undefined;
		return isValid({
			width: getUint24LE(view, 24) + 1,
			height: getUint24LE(view, 27) + 1,
		});
	}

	return undefined;
}
