// Ported from ttu's reader footer (BSD-3-Clause, ッツ Reader Authors).

import { useState } from "react";
import type { ReaderTheme } from "@/lib/lumi/settings";

interface LumiFooterProps {
	theme: ReaderTheme;
	explored: number;
	total: number;
	fraction: number;
	showCharacterCounter: boolean;
	showPercentage: boolean;
}

/** Bottom progress strip: character count / percentage, click to copy. */
export function LumiFooter({
	theme,
	explored,
	total,
	fraction,
	showCharacterCounter,
	showPercentage,
}: LumiFooterProps) {
	const [showFooter, setShowFooter] = useState(true);

	const currentProgress = [
		showCharacterCounter
			? `${explored.toLocaleString()} / ${total.toLocaleString()}`
			: "",
		showPercentage ? `${(fraction * 100).toFixed(2)}%` : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<div
			className="writing-horizontal-tb fixed bottom-0 left-0 z-30 flex h-8 w-full items-center justify-between text-xs leading-none"
			style={{ color: theme.tooltipTextFontColor }}
		>
			<button
				type="button"
				aria-label="Toggle progress display"
				className="h-full flex-1"
				onClick={() => setShowFooter((show) => !show)}
			/>
			{showFooter && total > 0 && (showCharacterCounter || showPercentage) && (
				<button
					type="button"
					title="Click to copy Progress"
					className="writing-horizontal-tb absolute right-2 bottom-2 z-10 select-none whitespace-pre text-xs tabular-nums leading-none"
					style={{ color: theme.tooltipTextFontColor }}
					onClick={() => {
						navigator.clipboard?.writeText(currentProgress).catch(() => {});
					}}
				>
					{currentProgress}
				</button>
			)}
		</div>
	);
}
