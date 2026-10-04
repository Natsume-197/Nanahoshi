/** An image shown "cover" inside a crop frame, zoomed by `zoom` (≥ 1) and
 * moved by `x`/`y` from centered, in frame points. */
export type CropView = {
	imageWidth: number;
	imageHeight: number;
	frameWidth: number;
	frameHeight: number;
	zoom: number;
	x: number;
	y: number;
};

function pointsPerPixel(view: CropView) {
	"worklet";
	return (
		Math.max(
			view.frameWidth / view.imageWidth,
			view.frameHeight / view.imageHeight,
		) * view.zoom
	);
}

/** How far the image may move each way before a frame edge shows. */
export function panLimits(view: CropView) {
	"worklet";
	const scale = pointsPerPixel(view);
	return {
		x: Math.max(0, (view.imageWidth * scale - view.frameWidth) / 2),
		y: Math.max(0, (view.imageHeight * scale - view.frameHeight) / 2),
	};
}

export function clampPan(view: CropView) {
	"worklet";
	const limits = panLimits(view);
	return {
		x: Math.min(limits.x, Math.max(-limits.x, view.x)),
		y: Math.min(limits.y, Math.max(-limits.y, view.y)),
	};
}

/** The part of the source image inside the frame, in image pixels. */
export function cropRect(view: CropView) {
	const scale = pointsPerPixel(view);
	const { x, y } = clampPan(view);
	const width = Math.min(view.imageWidth, view.frameWidth / scale);
	const height = Math.min(view.imageHeight, view.frameHeight / scale);
	const originX = view.imageWidth / 2 - x / scale - width / 2;
	const originY = view.imageHeight / 2 - y / scale - height / 2;
	return {
		originX: Math.round(
			Math.max(0, Math.min(view.imageWidth - width, originX)),
		),
		originY: Math.round(
			Math.max(0, Math.min(view.imageHeight - height, originY)),
		),
		width: Math.round(width),
		height: Math.round(height),
	};
}
