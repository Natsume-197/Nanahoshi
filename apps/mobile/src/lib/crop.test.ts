import { describe, expect, it } from "bun:test";
import { type CropView, clampPan, cropRect } from "./crop";

// A 4000×3000 photo in a 400×100 (4:1) frame: "cover" fits the width.
const base: CropView = {
	imageWidth: 4000,
	imageHeight: 3000,
	frameWidth: 400,
	frameHeight: 100,
	zoom: 1,
	x: 0,
	y: 0,
};

describe("cropRect", () => {
	it("takes the centered 4:1 band at rest", () => {
		expect(cropRect(base)).toEqual({
			originX: 0,
			originY: 1000,
			width: 4000,
			height: 1000,
		});
	});

	it("dragging the image down reveals its top", () => {
		// 1 frame point = 10 image pixels; dragging 50pt moves the band 500px up.
		expect(cropRect({ ...base, y: 50 }).originY).toBe(500);
	});

	it("zooming in takes a smaller band around the same center", () => {
		expect(cropRect({ ...base, zoom: 2 })).toEqual({
			originX: 1000,
			originY: 1250,
			width: 2000,
			height: 500,
		});
	});

	it("never crops outside the image, however far it was dragged", () => {
		const rect = cropRect({ ...base, y: 10_000, x: -10_000 });
		expect(rect.originY).toBe(0);
		expect(rect.originX).toBe(0);
		expect(rect.width).toBe(4000);
	});
});

describe("clampPan", () => {
	it("stops the image where a frame edge would show", () => {
		// The image is 300pt tall in a 100pt frame: 100pt of slack each way.
		expect(clampPan({ ...base, y: 180, x: 30 })).toEqual({ x: 0, y: 100 });
	});
});
