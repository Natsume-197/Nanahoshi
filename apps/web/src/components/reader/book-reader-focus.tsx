import { BookmarkSimple, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { type CSSProperties, useMemo, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useWindowEvent } from "@/hooks/use-window-event";
import {
	type FocusDocument,
	findFocusSentenceIndex,
	focusSentenceHtml,
	loadFocusDocument,
	resolveFocusTextAnchor,
} from "@/lib/reader/focus-sentences";
import { handleReaderContentClick } from "@/lib/reader/shared/reader-content-click";
import { applyReaderDocumentChrome } from "@/lib/reader/shared/reader-document-chrome";
import {
	buildReaderClasses,
	buildReaderStyle,
} from "@/lib/reader/shared/reader-style";
import type { ReaderTextAnchor, SectionWithProgress } from "@/lib/reader/types";
import { ReaderLoadingOverlay } from "./reader-loading-overlay";
import type { BaseReaderProps } from "./reader-shared-props";

interface BookReaderFocusProps extends BaseReaderProps {
	bookUuid: string;
	onExitFocus: () => void;
}

const clamp = (value: number, min: number, max: number) =>
	Math.min(max, Math.max(min, value));

const isOverlayEvent = (event: Event) =>
	event
		.composedPath()
		.some(
			(target) =>
				target instanceof Element &&
				Boolean(
					target.closest(
						'[role="dialog"],[data-slot="drawer-popup"],[data-reader-overlay]',
					),
				),
		);

export function BookReaderFocus({
	bookUuid,
	htmlContent,
	language,
	onExitFocus,
	navigationBlocked,
	verticalMode,
	theme,
	fontFamilyGroupOne,
	fontFamilyGroupTwo,
	fontWeight,
	fontSize,
	lineHeight,
	textIndentation,
	textMarginMode,
	textMarginValue,
	verticalTextOrientation,
	enableFontKerning,
	enableFontVPAL,
	prioritizeReaderStyles,
	enableTextJustification,
	enableTextWrapPretty,
	secondDimensionMaxValue,
	firstDimensionMargin,
	hideFurigana,
	furiganaStyle,
	disableWheelNavigation,
	sections,
	initialPosition,
	initialBookmark,
	onExploredCharCountChange,
	onSectionProgressChange,
	apiRef,
}: BookReaderFocusProps) {
	const parsedRef = useRef<FocusDocument | null>(null);
	const currentIndexRef = useRef(0);
	const precisePositionRef = useRef(initialPosition?.exploredCharCount ?? 0);
	const lastWheelAtRef = useRef(0);
	const progressTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const contentRef = useRef<HTMLDivElement | null>(null);
	const onExploredChangeRef = useRef(onExploredCharCountChange);
	onExploredChangeRef.current = onExploredCharCountChange;
	const onSectionProgressChangeRef = useRef(onSectionProgressChange);
	onSectionProgressChangeRef.current = onSectionProgressChange;
	const disableWheelNavigationRef = useRef(disableWheelNavigation);
	disableWheelNavigationRef.current = disableWheelNavigation;
	const navigationBlockedRef = useRef(navigationBlocked);
	navigationBlockedRef.current = navigationBlocked;

	const [focusDocument, setFocusDocument] = useState<FocusDocument | null>(
		null,
	);
	const [preparationError, setPreparationError] = useState(false);
	const [sentenceIndex, setSentenceIndex] = useState(0);
	const [displayedBookmark, setDisplayedBookmark] = useState(initialBookmark);

	const updateSectionProgress = (
		exploredCharacter: number,
		parsed: FocusDocument,
	) => {
		const progress = new Map<string, SectionWithProgress>();
		for (const section of sections) {
			const parsedRange = parsed.sectionRanges.get(section.reference);
			const start = section.startCharacter ?? parsedRange?.startCharacter;
			const end =
				start !== undefined && section.characters !== undefined
					? start + section.characters
					: parsedRange?.endCharacter;
			const value =
				start === undefined || end === undefined || end <= start
					? 0
					: clamp(((exploredCharacter - start) / (end - start)) * 100, 0, 100);
			progress.set(section.reference, { ...section, progress: value });
		}
		onSectionProgressChangeRef.current(progress);
	};
	const scheduleSectionProgress = (
		exploredCharacter: number,
		parsed: FocusDocument,
	) => {
		clearTimeout(progressTimerRef.current);
		progressTimerRef.current = setTimeout(
			() => updateSectionProgress(exploredCharacter, parsed),
			120,
		);
	};

	const showSentence = (
		requestedIndex: number,
		options: { preservePosition?: number } = {},
	) => {
		const parsed = parsedRef.current;
		if (!parsed?.sentences.length) return;
		const nextIndex = clamp(requestedIndex, 0, parsed.sentences.length - 1);
		const sentence = parsed.sentences[nextIndex];
		if (!sentence) return;
		currentIndexRef.current = nextIndex;
		setSentenceIndex(nextIndex);
		const exploredCharacter =
			options.preservePosition ?? sentence.startCharacter;
		precisePositionRef.current = exploredCharacter;
		onExploredChangeRef.current(exploredCharacter);
		scheduleSectionProgress(exploredCharacter, parsed);
	};

	const moveSentence = (direction: -1 | 1) => {
		const parsed = parsedRef.current;
		if (!parsed?.sentences.length) return;
		const currentIndex = currentIndexRef.current;
		const requested = currentIndex + direction;
		if (requested < 0) return;
		if (requested >= parsed.sentences.length) {
			precisePositionRef.current = parsed.totalCharacters;
			onExploredChangeRef.current(parsed.totalCharacters);
			updateSectionProgress(parsed.totalCharacters, parsed);
			return;
		}
		showSentence(requested);
	};

	useMountEffect(() => {
		let cancelled = false;
		const parseController = new AbortController();
		const cleanupChrome = applyReaderDocumentChrome({
			mode: "focus",
			verticalMode,
			backgroundColor: theme.backgroundColor,
		});

		void loadFocusDocument({
			cacheKey: bookUuid,
			htmlContent,
			language,
			document,
			sectionReferences: sections.map((section) => section.reference),
			signal: parseController.signal,
		})
			.then((parsed) => {
				if (cancelled) return;
				parsedRef.current = parsed;
				const initialCharacter = initialPosition?.exploredCharCount ?? 0;
				const initialIndex = findFocusSentenceIndex(
					parsed.sentences,
					initialCharacter,
				);
				currentIndexRef.current = initialIndex;
				precisePositionRef.current = initialCharacter;
				setFocusDocument(parsed);
				setSentenceIndex(initialIndex);
				onExploredChangeRef.current(initialCharacter);
				updateSectionProgress(initialCharacter, parsed);

				const navigateToCharacter = (character: number) => {
					showSentence(findFocusSentenceIndex(parsed.sentences, character), {
						preservePosition: character,
					});
				};
				const resolveAnchor = (anchor: ReaderTextAnchor) =>
					resolveFocusTextAnchor(parsed, anchor, precisePositionRef.current);
				apiRef({
					nextPage: () => moveSentence(1),
					prevPage: () => moveSentence(-1),
					navigateToSection: (reference) => {
						const character =
							parsed.anchorCharacters.get(reference) ??
							parsed.sectionRanges.get(reference)?.startCharacter;
						if (character !== undefined) navigateToCharacter(character);
					},
					navigateToTextAnchor: (anchor) => {
						const character = resolveAnchor(anchor);
						if (character !== undefined) navigateToCharacter(character);
					},
					resolveTextAnchor: resolveAnchor,
					getBookmark: () => ({
						exploredCharCount: precisePositionRef.current,
						progress: parsed.totalCharacters
							? precisePositionRef.current / parsed.totalCharacters
							: 0,
						lastBookmarkModified: Date.now(),
					}),
					scrollToBookmark: (bookmark) => {
						setDisplayedBookmark(bookmark);
						navigateToCharacter(bookmark.exploredCharCount);
					},
					showBookmarkMarker: setDisplayedBookmark,
					relayout: (position) => {
						if (position)
							precisePositionRef.current = position.exploredCharCount;
					},
				});
			})
			.catch((error) => {
				if (!parseController.signal.aborted) {
					console.error("Failed to prepare Focus mode", error);
					setPreparationError(true);
				}
			});

		return () => {
			cancelled = true;
			parseController.abort();
			cleanupChrome();
			clearTimeout(progressTimerRef.current);
			apiRef(null);
		};
	});

	useWindowEvent("wheel", (event) => {
		if (
			disableWheelNavigationRef.current ||
			navigationBlockedRef.current ||
			!parsedRef.current ||
			isOverlayEvent(event)
		) {
			return;
		}
		const delta =
			Math.abs(event.deltaY) >= Math.abs(event.deltaX)
				? event.deltaY
				: event.deltaX;
		if (!delta) return;
		const parsed = parsedRef.current;
		const atStart = currentIndexRef.current === 0 && delta < 0;
		const atEnd =
			currentIndexRef.current >= parsed.sentences.length - 1 &&
			delta > 0 &&
			precisePositionRef.current >= parsed.totalCharacters;
		if (atStart || atEnd) return;
		const now = Date.now();
		if (now - lastWheelAtRef.current < 180) return;
		lastWheelAtRef.current = now;
		event.preventDefault();
		moveSentence(delta > 0 ? 1 : -1);
	});

	const sentence = focusDocument?.sentences[sentenceIndex];
	const sentenceHtml = useMemo(
		() => (sentence ? focusSentenceHtml(document, sentence) : ""),
		[sentence],
	);
	const isFirstSentence = sentenceIndex === 0;
	const isLastSentence =
		!focusDocument || sentenceIndex >= focusDocument.sentences.length - 1;
	const isBookmarkSentence =
		sentence !== undefined &&
		displayedBookmark !== undefined &&
		displayedBookmark.exploredCharCount >= sentence.startCharacter &&
		displayedBookmark.exploredCharCount < sentence.endCharacter;
	const sentenceClasses = buildReaderClasses({
		mode: "focus",
		verticalMode,
		hideFurigana,
		furiganaStyle,
		fontWeight,
		prioritizeReaderStyles,
		enableTextJustification,
		enableTextWrapPretty,
		textMarginMode,
	});
	const sentenceStyle: CSSProperties = {
		...buildReaderStyle({
			theme,
			fontFamilyGroupOne,
			fontFamilyGroupTwo,
			fontWeight,
			fontSize,
			lineHeight,
			textIndentation,
			textMarginValue,
			verticalTextOrientation,
			verticalMode,
			firstDimensionMargin,
			enableFontKerning,
			enableFontVPAL,
		}),
		writingMode: verticalMode ? "vertical-rl" : "horizontal-tb",
		maxWidth:
			!verticalMode && secondDimensionMaxValue
				? `${secondDimensionMaxValue}px`
				: undefined,
		maxHeight:
			verticalMode && secondDimensionMaxValue
				? `${secondDimensionMaxValue}px`
				: undefined,
	};

	return (
		<section
			aria-label="Focus reader"
			lang={language || undefined}
			className="focus-reader-surface fixed inset-0 flex items-center justify-center overflow-hidden"
			style={{ backgroundColor: theme.backgroundColor }}
		>
			<button
				type="button"
				aria-label="Previous sentence"
				aria-keyshortcuts="ArrowLeft ArrowUp PageUp"
				disabled={isFirstSentence || !sentence}
				className="fixed top-1/2 left-[max(0.25rem,var(--safe-area-left))] z-[3] flex size-11 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full border bg-transparent opacity-25 outline-none transition-opacity hover:opacity-70 focus-visible:opacity-100 focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-0 motion-reduce:transition-none"
				style={{ borderColor: theme.fontColor, color: theme.fontColor }}
				onClick={() => moveSentence(-1)}
			>
				<CaretLeft aria-hidden="true" className="size-5" weight="bold" />
			</button>
			<div
				role="status"
				aria-live="polite"
				aria-atomic="true"
				className={`${sentenceClasses} relative z-[2] flex max-h-full w-full max-w-3xl overflow-auto overscroll-contain`}
				style={sentenceStyle}
			>
				{isBookmarkSentence && (
					<BookmarkSimple
						aria-hidden="true"
						weight="fill"
						className="pointer-events-none absolute top-0 left-0 size-5 opacity-25"
					/>
				)}
				{sentence ? (
					<div
						key={`${sentence.sectionReference}:${sentenceIndex}`}
						ref={contentRef}
						id={sentence.sectionReference}
						data-focus-fragment-ids={JSON.stringify(sentence.fragmentIds)}
						role="document"
						// biome-ignore lint/a11y/noNoninteractiveTabindex: the rendered publication is a keyboard surface for furigana and Read & Listen sentence seeking
						tabIndex={0}
						className="focus-sentence-content min-h-fit min-w-fit"
						onClick={(event) =>
							handleReaderContentClick(
								event.nativeEvent,
								{ hideFurigana, furiganaStyle },
								() => {},
							)
						}
						onKeyDown={(event) => {
							if (
								event.key !== "Enter" ||
								!hideFurigana ||
								(furiganaStyle !== "Toggle" && furiganaStyle !== "Full")
							) {
								return;
							}
							for (const ruby of contentRef.current?.querySelectorAll("ruby") ??
								[]) {
								if (furiganaStyle === "Toggle") {
									ruby.classList.toggle("reveal-rt");
								} else {
									ruby.classList.add("reveal-rt");
								}
							}
						}}
						// biome-ignore lint/security/noDangerouslySetInnerHtml: cloned from the reader's already-sanitized book HTML
						dangerouslySetInnerHTML={{ __html: sentenceHtml }}
					/>
				) : focusDocument ? (
					<p>No readable text found.</p>
				) : null}
			</div>
			<button
				type="button"
				aria-label={
					isLastSentence ? "Mark final sentence read" : "Next sentence"
				}
				aria-keyshortcuts="ArrowRight ArrowDown PageDown"
				disabled={!sentence}
				className="fixed top-1/2 right-[max(0.25rem,var(--safe-area-right))] z-[3] flex size-11 -translate-y-1/2 touch-manipulation items-center justify-center rounded-full border bg-transparent opacity-25 outline-none transition-opacity hover:opacity-70 focus-visible:opacity-100 focus-visible:outline-2 disabled:pointer-events-none disabled:opacity-0 motion-reduce:transition-none"
				style={{ borderColor: theme.fontColor, color: theme.fontColor }}
				onClick={() => moveSentence(1)}
			>
				<CaretRight aria-hidden="true" className="size-5" weight="bold" />
			</button>
			{preparationError ? (
				<div
					data-reader-overlay
					className="writing-horizontal-tb fixed inset-0 z-10 flex items-center justify-center p-6"
					style={{ backgroundColor: theme.backgroundColor }}
				>
					<div className="max-w-sm text-center">
						<p className="font-medium">
							Focus mode could not prepare this book.
						</p>
						<p className="mt-2 text-sm opacity-70">
							This publication has a section that is too large to prepare
							safely.
						</p>
						<button
							type="button"
							className="mt-5 min-h-11 rounded-full border px-5 font-medium text-sm"
							style={{ borderColor: theme.fontColor }}
							onClick={onExitFocus}
						>
							Continue in Continuous mode
						</button>
					</div>
				</div>
			) : (
				!focusDocument && <ReaderLoadingOverlay theme={theme} />
			)}
		</section>
	);
}
