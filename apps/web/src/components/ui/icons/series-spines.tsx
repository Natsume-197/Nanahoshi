import type { IconProps, IconWeight } from "@phosphor-icons/react";
import { forwardRef } from "react";

// Custom "series" glyph in the Phosphor style: two book spines, the second
// leaning diagonally against the first. Phosphor ships no equivalent, so this
// mirrors its IconProps API (weight/color/size) to drop into icon lists.
const STROKE_BY_WEIGHT: Partial<Record<IconWeight, number>> = {
	thin: 8,
	light: 12,
	regular: 16,
	bold: 24,
};

export const SeriesSpines = forwardRef<SVGSVGElement, IconProps>(
	(
		{ weight = "regular", color = "currentColor", size = "1em", ...rest },
		ref,
	) => {
		const filled = weight === "fill" || weight === "duotone";
		return (
			<svg
				ref={ref}
				xmlns="http://www.w3.org/2000/svg"
				width={size}
				height={size}
				viewBox="0 0 256 256"
				fill={filled ? color : "none"}
				stroke={filled ? "none" : color}
				strokeWidth={filled ? undefined : (STROKE_BY_WEIGHT[weight] ?? 16)}
				strokeLinejoin="round"
				aria-hidden="true"
				focusable="false"
				{...rest}
			>
				{/* First upright spine */}
				<rect x="40" y="48" width="34" height="160" rx="9" />
				{/* Second upright spine */}
				<rect x="90" y="48" width="34" height="160" rx="9" />
				{/* Third spine reclining against the second: base apart, tops touch */}
				<rect
					x="160"
					y="48"
					width="34"
					height="160"
					rx="9"
					transform="rotate(-22 175 148)"
				/>
			</svg>
		);
	},
);

SeriesSpines.displayName = "SeriesSpines";
