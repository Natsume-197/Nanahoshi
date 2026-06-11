/**
 * Port of ttu's book-toc (BSD-3-Clause, ッツ Reader Authors).
 */

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { SectionWithProgress } from "@/components/reader/book-reader-continuous";
import type { ReaderTheme } from "@/lib/reader/settings";

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

	return (
		<>
			{/* ttu closes the ToC on outside click (clickOutside action) */}
			<button
				type="button"
				aria-label="Close Table of Contents"
				className="writing-horizontal-tb fixed inset-0 z-[59] cursor-default"
				onClick={onClose}
			/>
			<div
				className="writing-horizontal-tb fixed top-0 left-0 z-[60] flex h-full w-full max-w-xl flex-col justify-between"
				style={{
					color: theme.fontColor,
					backgroundColor: theme.backgroundColor,
				}}
			>
				<div className="flex justify-between p-4">
					<div>
						Chapter Progress: {currentChapterCharacterProgress} (
						{currentChapterProgress}%)
					</div>
					<button
						type="button"
						title="Close Table of Contents"
						className="flex cursor-pointer items-end md:items-center"
						onClick={onClose}
					>
						<X className="size-5" />
					</button>
				</div>
				<div className="flex-1 overflow-auto p-4">
					{chapters.map((chapter) => {
						const isCompletedOther =
							chapter.progress === 100 && chapter !== currentChapter;
						return (
							<div
								key={chapter.reference}
								className="my-6 flex justify-between"
							>
								<button
									type="button"
									title={`Go to ${chapter.label}`}
									className={`mr-4 cursor-pointer text-left ${
										isCompletedOther
											? "opacity-30 hover:opacity-100"
											: "hover:opacity-60"
									}`}
									onClick={() => {
										onNavigate(chapter.reference);
										onClose();
									}}
								>
									{chapter.label}
								</button>
								<div className={isCompletedOther ? "opacity-30" : ""}>
									{chapter.startCharacter}
								</div>
							</div>
						);
					})}
				</div>
				<div className="flex justify-between px-4 py-6">
					<button
						type="button"
						title={
							prevChapterAvailable
								? `${verticalMode ? "Next" : "Previous"} Chapter`
								: ""
						}
						className={prevChapterAvailable ? "cursor-pointer" : "opacity-30"}
						onClick={() =>
							changeChapter(prevChapterAvailable, verticalMode ? 1 : -1)
						}
					>
						<ChevronLeft className="size-5" />
					</button>
					<button
						type="button"
						title={
							nextChapterAvailable
								? `${verticalMode ? "Previous" : "Next"} Chapter`
								: ""
						}
						className={nextChapterAvailable ? "cursor-pointer" : "opacity-30"}
						onClick={() =>
							changeChapter(nextChapterAvailable, verticalMode ? -1 : 1)
						}
					>
						<ChevronRight className="size-5" />
					</button>
				</div>
			</div>
		</>
	);
}
