import sharp from "sharp";

const SAMPLE_SIZE = 16;
const BUCKET_COUNT = 16 * 16 * 16;
const HUE_BUCKET_COUNT = 12;

function toHex(value: number): string {
	return Math.round(value).toString(16).padStart(2, "0");
}

function colorMetrics(r: number, g: number, b: number) {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const lightness = (max + min) / 510;
	const range = max - min;
	const saturation =
		range === 0 ? 0 : range / 255 / (1 - Math.abs(2 * lightness - 1));
	let hue = 0;
	if (range > 0) {
		if (max === r) hue = 60 * (((g - b) / range) % 6);
		else if (max === g) hue = 60 * ((b - r) / range + 2);
		else hue = 60 * ((r - g) / range + 4);
		if (hue < 0) hue += 360;
	}
	return {
		lightness,
		saturation,
		hueBucket: Math.floor(((hue + 15) % 360) / 30),
	};
}

/**
 * Selects a representative accent from RGB pixels in O(pixels + used colors).
 * Four-bit RGB buckets prevent a single vivid pixel from beating a color that
 * occupies a meaningful part of the cover.
 */
export function selectCoverColor(data: Uint8Array): string | null {
	if (data.length < 3) return null;

	const counts = new Uint16Array(BUCKET_COUNT);
	const red = new Uint32Array(BUCKET_COUNT);
	const green = new Uint32Array(BUCKET_COUNT);
	const blue = new Uint32Array(BUCKET_COUNT);
	const hueWeights = new Float64Array(HUE_BUCKET_COUNT);
	const used = new Uint16Array(Math.ceil(data.length / 3));
	let usedCount = 0;
	let maxCount = 0;
	let totalR = 0;
	let totalG = 0;
	let totalB = 0;
	let pixels = 0;

	for (let i = 0; i + 2 < data.length; i += 3) {
		const r = data[i] ?? 0;
		const g = data[i + 1] ?? 0;
		const b = data[i + 2] ?? 0;
		const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
		if (counts[key] === 0) used[usedCount++] = key;
		counts[key]++;
		red[key] += r;
		green[key] += g;
		blue[key] += b;
		const metrics = colorMetrics(r, g, b);
		if (
			metrics.saturation >= 0.15 &&
			metrics.lightness >= 0.08 &&
			metrics.lightness <= 0.9
		) {
			const usableLight = Math.max(
				0.05,
				1 - Math.abs(metrics.lightness - 0.52) * 2.2,
			);
			hueWeights[metrics.hueBucket] += metrics.saturation ** 1.35 * usableLight;
		}
		maxCount = Math.max(maxCount, counts[key]);
		totalR += r;
		totalG += g;
		totalB += b;
		pixels++;
	}

	let bestScore = -1;
	let bestR = totalR / pixels;
	let bestG = totalG / pixels;
	let bestB = totalB / pixels;
	// Lavender artwork commonly straddles the 270°/300° boundary. Treat both
	// buckets as one violet family so gradients do not split their presence.
	const violetWeight = (hueWeights[9] + hueWeights[10]) * 1.5;
	hueWeights[9] = violetWeight;
	hueWeights[10] = violetWeight;
	const maxHueWeight = Math.max(...hueWeights);

	for (let i = 0; i < usedCount; i++) {
		const key = used[i] ?? 0;
		const count = counts[key] ?? 1;
		const r = (red[key] ?? 0) / count;
		const g = (green[key] ?? 0) / count;
		const b = (blue[key] ?? 0) / count;
		const { lightness, saturation, hueBucket } = colorMetrics(r, g, b);
		// Related shades contribute as one hue family (sky + hair + fabric), while
		// local bucket presence prevents one noisy pixel from representing it.
		const huePresence =
			maxHueWeight > 0 ? Math.sqrt(hueWeights[hueBucket] / maxHueWeight) : 1;
		const localPresence = (count / maxCount) ** 0.15;
		// Softly reject paper white and near-black without forcing every result
		// toward the same muddy middle luminance.
		const usableLight = Math.max(0.05, 1 - Math.abs(lightness - 0.52) * 2.2);
		// Chroma is intentionally non-linear: a coherent orange/green accent on a
		// mostly white cover should beat a much larger blue-gray uniform or shadow.
		const chroma = 0.04 + saturation ** 1.35 * 0.96;
		const score = huePresence * localPresence * chroma * usableLight;

		if (score > bestScore) {
			bestScore = score;
			bestR = r;
			bestG = g;
			bestB = b;
		}
	}

	return `#${toHex(bestR)}${toHex(bestG)}${toHex(bestB)}`;
}

/** Reads at most the same 256 pixels as the previous implementation. */
export async function extractDominantColor(
	filePath: string,
): Promise<string | null> {
	const { data } = await sharp(filePath)
		.resize(SAMPLE_SIZE, SAMPLE_SIZE, {
			fit: "inside",
			withoutEnlargement: true,
		})
		.removeAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	return selectCoverColor(data);
}
