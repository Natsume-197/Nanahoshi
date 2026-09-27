import { memo, useCallback } from "react";

/** Backing store of each layer. Tiny on purpose: the blur is baked in here once. */
const SIZE = 64;
/** Drawn past the edges so the blur's transparent fringe falls outside. */
const OVERSCAN = 0.3;
/** In canvas pixels; the layers are scaled ~8× on a phone: a wash of the cover's colours rather than its shapes. Restrained saturation keeps it a mood, not a poster. */
const FILTER = "blur(9px) saturate(1.1) brightness(0.55)";

/** Canvas filters arrived late in Safari; the DOM types assume they're always there. */
const supportsCanvasFilter =
	typeof CanvasRenderingContext2D !== "undefined" &&
	"filter" in CanvasRenderingContext2D.prototype;

function paint(canvas: HTMLCanvasElement, image: HTMLImageElement) {
	const ctx = canvas.getContext("2d");
	if (!ctx || !image.naturalWidth || !image.naturalHeight) return;
	const side = SIZE * (1 + OVERSCAN * 2);
	const scale = Math.max(side / image.naturalWidth, side / image.naturalHeight);
	const width = image.naturalWidth * scale;
	const height = image.naturalHeight * scale;
	const x = -SIZE * OVERSCAN + (side - width) / 2;
	const y = -SIZE * OVERSCAN + (side - height) / 2;
	ctx.imageSmoothingQuality = "high";
	if (supportsCanvasFilter) {
		ctx.filter = FILTER;
		ctx.drawImage(image, x, y, width, height);
		return;
	}
	// No canvas filters (older Safari): crush it to a few pixels and let the
	// smoothed upscale spread them into soft fields.
	const tiny = document.createElement("canvas");
	tiny.width = 6;
	tiny.height = 6;
	tiny
		.getContext("2d")
		?.drawImage(image, x / 10, y / 10, width / 10, height / 10);
	ctx.drawImage(tiny, 0, 0, SIZE, SIZE);
}

/**
 * The cover as the scene: the art itself, blurred past recognition, dimmed
 * and still — the quiet backdrop of Apple Music's player. No motion and no
 * second layer; the artwork in front is the only thing that should draw the
 * eye.
 *
 * Nothing is blurred at runtime. The layer is a 64px canvas painted once per
 * cover and stretched by the compositor, so the open transition has nothing
 * to fight. A canvas, not pixel reads, so a cross-origin cover needs no CORS.
 */
export const PlayerArtField = memo(function PlayerArtField({
	src,
}: {
	src: string;
}) {
	const attach = useCallback(
		(field: HTMLDivElement | null) => {
			if (!field) return;
			const image = new Image();
			image.decoding = "async";
			image.onload = () => {
				for (const canvas of field.querySelectorAll("canvas")) {
					paint(canvas, image);
				}
				field.dataset.ready = "true";
			};
			image.src = src;
			return () => {
				image.onload = null;
			};
		},
		[src],
	);

	return (
		<div ref={attach} aria-hidden className="player-art-field">
			<canvas width={SIZE} height={SIZE} className="player-art-layer" />
			<div className="player-art-scrim" />
		</div>
	);
});
