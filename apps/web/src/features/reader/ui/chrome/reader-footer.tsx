import { useState } from "react";
import type { ReaderTheme } from "@/features/reader/presentation/settings";
import type { VisualProgressStyle } from "@/features/reader/presentation/visual-settings";

interface ReaderFooterProps {
	theme: ReaderTheme;
	exploredCharCount: number;
	bookCharCount: number;
	showCharacterCounter: boolean;
	showPercentage: boolean;
	reservePlayerSpace?: boolean;
	/** Visual books use the whole canvas for page-turn taps. */
	passThrough?: boolean;
	visualProgress?: {
		currentPage: number;
		pageCount: number;
		style: VisualProgressStyle;
	};
}

export function ReaderFooter({
	theme,
	exploredCharCount,
	bookCharCount,
	showCharacterCounter,
	showPercentage,
	reservePlayerSpace = false,
	passThrough = false,
	visualProgress,
}: ReaderFooterProps) {
	const [showFooter, setShowFooter] = useState(true);

	const current = visualProgress?.currentPage ?? exploredCharCount;
	const total = visualProgress?.pageCount ?? bookCharCount;
	const progress = Math.min(1, Math.max(0, current / (total || 1)));
	const currentProgress = [
		showCharacterCounter ? `${current} / ${total}` : "",
		showPercentage ? `${(progress * 100).toFixed(2)}%` : "",
	]
		.filter(Boolean)
		.join(" ");
	const graphicalProgress = Boolean(
		visualProgress && visualProgress.style !== "text",
	);
	const progressLabel = `Page ${current} of ${total}`;
	const bottomClass = reservePlayerSpace
		? "bottom-[calc(var(--mobile-player-height)+var(--safe-area-bottom))] md:bottom-[var(--player-reserve)]"
		: "bottom-0";

	return (
		// reader-ui-contain: the counter text changes on every scroll tick; layout
		// containment keeps that invalidation from forcing a relayout of the huge
		// book document (which froze scrolling at ~2 FPS on long books).
		<div
			id="nanahoshi-page-footer"
			data-reader-progress
			data-reader-progress-current={current}
			data-reader-progress-total={total}
			data-reader-progress-percent={(progress * 100).toFixed(2)}
			className={`reader-ui-contain writing-horizontal-tb fixed left-0 z-10 flex h-[calc(2rem+var(--safe-area-bottom))] w-full items-center justify-between pr-[var(--safe-area-right)] pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)] text-xs leading-none ${bottomClass} ${passThrough ? "pointer-events-none" : ""}`}
			style={{ color: theme.tooltipTextFontColor }}
		>
			{!passThrough && (
				<button
					type="button"
					aria-label="Toggle progress display"
					className="h-full flex-1"
					onClick={() => setShowFooter((show) => !show)}
				/>
			)}
			{showFooter &&
				total > 0 &&
				graphicalProgress &&
				(visualProgress?.style === "page-lines" ? (
					<div
						role="progressbar"
						aria-label="Reading progress"
						aria-valuemin={1}
						aria-valuemax={total}
						aria-valuenow={current}
						aria-valuetext={progressLabel}
						className="absolute right-[max(0.75rem,var(--safe-area-right))] bottom-[calc(0.65rem+var(--safe-area-bottom))] left-[max(0.75rem,var(--safe-area-left))] grid h-1 items-stretch"
						style={{
							gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))`,
							gap: total > 120 ? 0 : total > 60 ? 1 : 2,
						}}
					>
						{Array.from({ length: total }, (_, index) => (
							<span
								// biome-ignore lint/suspicious/noArrayIndexKey: page positions are a fixed, ordered scale without state
								key={index}
								aria-hidden="true"
								className="rounded-full"
								style={{
									backgroundColor: theme.tooltipTextFontColor,
									opacity:
										index + 1 === current ? 1 : index < current ? 0.55 : 0.18,
								}}
							/>
						))}
					</div>
				) : (
					<div
						role="progressbar"
						aria-label="Reading progress"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={Math.round(progress * 100)}
						aria-valuetext={progressLabel}
						className="absolute right-[max(0.75rem,var(--safe-area-right))] bottom-[calc(0.7rem+var(--safe-area-bottom))] left-[max(0.75rem,var(--safe-area-left))] h-1 overflow-hidden rounded-full"
						style={{
							backgroundColor: `color-mix(in oklab, ${theme.tooltipTextFontColor} 18%, transparent)`,
						}}
					>
						<div
							className="h-full rounded-full"
							style={{
								width: `${progress * 100}%`,
								backgroundColor: theme.tooltipTextFontColor,
							}}
						/>
					</div>
				))}
			{showFooter &&
				total > 0 &&
				!graphicalProgress &&
				(showCharacterCounter || showPercentage) && (
					<button
						type="button"
						title="Click to copy Progress"
						className="writing-horizontal-tb pointer-events-auto absolute right-[max(0.5rem,var(--safe-area-right))] bottom-[calc(0.5rem+var(--safe-area-bottom))] z-10 select-none whitespace-pre text-xs leading-none"
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
