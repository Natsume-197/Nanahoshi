import { CaretLeft, CaretRight, X } from "@phosphor-icons/react";
import { type CSSProperties, useEffect } from "react";
import type { ReaderTheme } from "@/features/reader/presentation/settings";
import type { SectionWithProgress } from "@/features/reader/renderers/continuous/book-reader-continuous";
import { readerMix } from "@/features/reader/ui/controls/reader-controls";

interface ReaderTocProps {
	theme: ReaderTheme;
	sectionProgress: Map<string, SectionWithProgress>;
	exploredCharCount: number;
	verticalMode: boolean;
	onNavigate: (reference: string) => void;
	onClose: () => void;
}

function getWeightedAverage(values: number[], weights: number[]) {
	const [valueSum, weightSum] = values.reduce(
		([vAcc, wAcc], value, index) => [
			vAcc + value * weights[index],
			wAcc + weights[index],
		],
		[0, 0],
	);
	return weightSum ? valueSum / weightSum : 0;
}

function getChapterData(
	sectionData: SectionWithProgress[],
): [SectionWithProgress[], number, string] {
	const mainChapters = sectionData.filter((section) => !section.parentChapter);

	let currentSection = sectionData.find((section) => section.progress < 100);
	if (!currentSection) {
		currentSection = sectionData[sectionData.length - 1];
	}

	const referenceId = currentSection.parentChapter || currentSection.reference;
	const currentChapterIndex = mainChapters.findIndex(
		(section) => section.reference === referenceId,
	);

	return [mainChapters, currentChapterIndex, referenceId];
}

export function ReaderToc({
	theme,
	sectionProgress,
	exploredCharCount,
	verticalMode,
	onNavigate,
	onClose,
}: ReaderTocProps) {
	useEffect(() => {
		const root = document.documentElement.style;
		const previousOverflow = root.overflow;
		root.overflow = "hidden";
		return () => {
			root.overflow = previousOverflow;
		};
	}, []);
	const sectionData = [...sectionProgress.values()];
	if (!sectionData.length) return null;

	const [chapters, currentChapterIndex, referenceId] =
		getChapterData(sectionData);
	const currentChapter = chapters[currentChapterIndex];

	const relevantSections = sectionData.filter(
		(section) =>
			section.reference === referenceId ||
			section.parentChapter === referenceId,
	);
	const currentChapterProgress = getWeightedAverage(
		relevantSections.map((section) => section.progress),
		relevantSections.map((section) => section.charactersWeight),
	).toFixed(2);

	const endCharacter = (currentChapter?.characters as number) ?? 0;
	const currentChapterCharacterProgress = currentChapter
		? `${Math.min(
				Math.max(
					exploredCharCount - ((currentChapter.startCharacter as number) ?? 0),
					0,
				),
				endCharacter,
			)} / ${endCharacter}`
		: "0 / 0";

	const prevChapterAvailable = verticalMode
		? currentChapterIndex < chapters.length - 1
		: !!currentChapterIndex;
	const nextChapterAvailable = verticalMode
		? !!currentChapterIndex
		: currentChapterIndex < chapters.length - 1;

	const changeChapter = (canNavigate: boolean, indexMod: number) => {
		if (!canNavigate) return;
		const nextChapter = chapters[currentChapterIndex + indexMod];
		if (nextChapter) onNavigate(nextChapter.reference);
	};

	const mix = (pct: number) => readerMix(theme, pct);
	const navButtonClasses =
		"flex h-11 w-11 shrink-0 items-center justify-center rounded-md transition-[background-color,opacity] duration-150 sm:h-10 sm:w-10";

	return (
		<>
			{/* Nanahoshi closes the ToC on outside click (clickOutside action) */}
			<button
				type="button"
				aria-label="Close Table of Contents"
				className="fade-in writing-horizontal-tb fixed inset-0 z-[59] animate-in cursor-default bg-black/20 duration-200 motion-reduce:animate-none"
				onClick={onClose}
			/>
			<div
				className="slide-in-from-left writing-horizontal-tb fixed top-0 left-0 z-[60] flex h-dvh w-full max-w-md animate-in flex-col border-r pt-[var(--safe-area-top)] pb-[var(--safe-area-bottom)] pl-[var(--safe-area-left)] shadow-xl duration-300 ease-out motion-reduce:animate-none"
				style={
					{
						color: theme.fontColor,
						backgroundColor: theme.backgroundColor,
						borderColor: mix(12),
						"--rh-hover": mix(8),
					} as CSSProperties
				}
			>
				<div
					className="flex h-13 shrink-0 items-center justify-between border-b pr-2 pl-4 sm:h-12"
					style={{ borderColor: mix(12) }}
				>
					<span className="font-medium text-sm">Contents</span>
					<button
						type="button"
						title="Close Table of Contents"
						aria-label="Close Table of Contents"
						className={`${navButtonClasses} cursor-pointer opacity-70 hover:bg-[var(--rh-hover)] hover:opacity-100`}
						onClick={onClose}
					>
						<X className="size-5" />
					</button>
				</div>

				{/* Current chapter progress */}
				<div
					className="shrink-0 border-b px-4 py-3"
					style={{ borderColor: mix(12) }}
				>
					<div className="mb-1.5 flex items-baseline justify-between gap-3">
						<span className="truncate font-medium text-sm">
							{currentChapter?.label ?? ""}
						</span>
						<span className="shrink-0 text-sm tabular-nums opacity-60">
							{currentChapterProgress}%
						</span>
					</div>
					<div
						className="h-1 overflow-hidden rounded-full"
						style={{ backgroundColor: mix(15) }}
					>
						<div
							className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
							style={{
								width: `${currentChapterProgress}%`,
								backgroundColor: theme.fontColor,
							}}
						/>
					</div>
					<div className="mt-1.5 text-xs tabular-nums opacity-50">
						{currentChapterCharacterProgress} characters
					</div>
				</div>

				<div className="flex-1 overflow-auto p-2">
					{chapters.map((chapter) => {
						const isCurrent = chapter === currentChapter;
						const isCompletedOther = chapter.progress === 100 && !isCurrent;
						return (
							<button
								key={chapter.reference}
								type="button"
								title={`Go to ${chapter.label}`}
								className={`flex w-full cursor-pointer items-center justify-between gap-4 rounded-md px-2 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-[var(--rh-hover)] ${
									isCompletedOther ? "opacity-40 hover:opacity-80" : ""
								} ${isCurrent ? "font-medium" : ""}`}
								style={isCurrent ? { backgroundColor: mix(10) } : undefined}
								onClick={() => {
									onNavigate(chapter.reference);
									onClose();
								}}
							>
								<span className="min-w-0 truncate">{chapter.label}</span>
								<span className="shrink-0 text-xs tabular-nums opacity-50">
									{chapter.startCharacter}
								</span>
							</button>
						);
					})}
				</div>

				<div
					className="flex shrink-0 items-center justify-between border-t px-2 py-2"
					style={{ borderColor: mix(12) }}
				>
					<button
						type="button"
						title={
							prevChapterAvailable
								? `${verticalMode ? "Next" : "Previous"} Chapter`
								: undefined
						}
						aria-label="Previous chapter in reading order"
						disabled={!prevChapterAvailable}
						className={`${navButtonClasses} ${
							prevChapterAvailable
								? "cursor-pointer opacity-70 hover:bg-[var(--rh-hover)] hover:opacity-100"
								: "opacity-30"
						}`}
						onClick={() =>
							changeChapter(prevChapterAvailable, verticalMode ? 1 : -1)
						}
					>
						<CaretLeft className="size-5" />
					</button>
					<span className="text-xs tabular-nums opacity-50">
						{currentChapterIndex + 1} / {chapters.length}
					</span>
					<button
						type="button"
						title={
							nextChapterAvailable
								? `${verticalMode ? "Previous" : "Next"} Chapter`
								: undefined
						}
						aria-label="Next chapter in reading order"
						disabled={!nextChapterAvailable}
						className={`${navButtonClasses} ${
							nextChapterAvailable
								? "cursor-pointer opacity-70 hover:bg-[var(--rh-hover)] hover:opacity-100"
								: "opacity-30"
						}`}
						onClick={() =>
							changeChapter(nextChapterAvailable, verticalMode ? -1 : 1)
						}
					>
						<CaretRight className="size-5" />
					</button>
				</div>
			</div>
		</>
	);
}
