/**
 * Port of ttu's reader page footer (BSD-3-Clause, ッツ Reader Authors):
 * a bottom strip that toggles the progress display, with the current
 * character count / percentage in the bottom-right corner (click to copy).
 */

import { useState } from "react";
import type { ReaderTheme } from "@/lib/reader/settings";

interface ReaderFooterProps {
	theme: ReaderTheme;
	exploredCharCount: number;
	bookCharCount: number;
	showCharacterCounter: boolean;
	showPercentage: boolean;
}

export function ReaderFooter({
	theme,
	exploredCharCount,
	bookCharCount,
	showCharacterCounter,
	showPercentage,
}: ReaderFooterProps) {
	const [showFooter, setShowFooter] = useState(true);

	const currentProgress = [
		showCharacterCounter ? `${exploredCharCount} / ${bookCharCount}` : "",
		showPercentage
			? `${((exploredCharCount / (bookCharCount || 1)) * 100).toFixed(2)}%`
			: "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		// reader-ui-contain: the counter text changes on every scroll tick; layout
		// containment keeps that invalidation from forcing a relayout of the huge
		// book document (which froze scrolling at ~2 FPS on long books).
		<div
			id="ttu-page-footer"
			className="reader-ui-contain writing-horizontal-tb fixed bottom-0 left-0 z-10 flex h-8 w-full items-center justify-between text-xs leading-none"
			style={{ color: theme.tooltipTextFontColor }}
		>
			<button
				type="button"
				aria-label="Toggle progress display"
				className="h-full flex-1"
				onClick={() => setShowFooter((show) => !show)}
			/>
			{showFooter &&
				bookCharCount > 0 &&
				(showCharacterCounter || showPercentage) && (
					<button
						type="button"
						title="Click to copy Progress"
						className="writing-horizontal-tb absolute right-2 bottom-2 z-10 select-none whitespace-pre text-xs leading-none"
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
