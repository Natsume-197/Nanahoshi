/** Pixel crop rectangle as reported by react-easy-crop's `onCropComplete`. */
export interface PixelCrop {
	x: number;
	y: number;
	width: number;
	height: number;
}

function createImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.addEventListener("load", () => resolve(image));
		image.addEventListener("error", (err) => reject(err));
		image.src = url;
	});
}

/** Bounding box of an image after rotating it by `rotation` degrees. */
function rotatedSize(width: number, height: number, rotation: number) {
	const rad = (rotation * Math.PI) / 180;
	return {
		width: Math.abs(Math.cos(rad) * width) + Math.abs(Math.sin(rad) * height),
		height: Math.abs(Math.sin(rad) * width) + Math.abs(Math.cos(rad) * height),
	};
}

/**
 * Renders the chosen crop (with rotation) to a canvas and returns a WebP blob.
 * WebP is only the upload intermediate — browsers can't encode AVIF via
 * canvas.toBlob, so the server transcodes to AVIF on upload; quality here only
 * needs to be high enough to survive that pass.
 */
export async function getCroppedBlob(
	imageSrc: string,
	crop: PixelCrop,
	rotation = 0,
): Promise<Blob> {
	const image = await createImage(imageSrc);
	const canvas = document.createElement("canvas");
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Could not get canvas context");

	const bbox = rotatedSize(image.width, image.height, rotation);
	canvas.width = bbox.width;
	canvas.height = bbox.height;

	// Draw the rotated image centered, then lift out just the crop rectangle.
	ctx.translate(bbox.width / 2, bbox.height / 2);
	ctx.rotate((rotation * Math.PI) / 180);
	ctx.translate(-image.width / 2, -image.height / 2);
	ctx.drawImage(image, 0, 0);

	const data = ctx.getImageData(crop.x, crop.y, crop.width, crop.height);
	canvas.width = crop.width;
	canvas.height = crop.height;
	ctx.putImageData(data, 0, 0);

	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => (blob ? resolve(blob) : reject(new Error("Canvas is empty"))),
			"image/webp",
			0.98,
		);
	});
}
