import { env } from "@nanahoshi-v2/env/web";

interface CoverVariant {
	width: number;
	height: number;
}

const COVER_WEBP_QUALITY = 92;

export function getCoverUrl(
	coverFilename: string,
	variant: CoverVariant,
): string {
	return `${env.VITE_SERVER_URL}/api/data/covers/${coverFilename}?width=${variant.width}&height=${variant.height}&quality=${COVER_WEBP_QUALITY}`;
}

export function getCoverSrcSet(
	coverFilename: string,
	variants: readonly CoverVariant[],
): string {
	const dedupedVariants = [...variants]
		.sort((left, right) => left.width - right.width)
		.filter(
			(variant, index, orderedVariants) =>
				index === 0 || variant.width !== orderedVariants[index - 1]?.width,
		);

	return dedupedVariants
		.map(
			(variant) => `${getCoverUrl(coverFilename, variant)} ${variant.width}w`,
		)
		.join(", ");
}
