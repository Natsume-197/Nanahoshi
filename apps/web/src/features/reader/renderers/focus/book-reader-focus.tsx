import {
	type CSSProperties,
	type MouseEvent as ReactMouseEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { ReaderTextAnchor } from "@/features/reader/document/types";
import type { FocusTextSpeed } from "@/features/reader/presentation/settings";
import type { BaseReaderProps } from "@/features/reader/reader-contract";
import { FocusSentenceView } from "@/features/reader/renderers/focus/focus-sentence-view";
import {
	type FocusDocument,
	findFocusSentenceIndex,
	focusSentenceHtml,
	resolveFocusTextAnchor,
} from "@/features/reader/renderers/focus/focus-sentences";
import { focusTapDirection } from "@/features/reader/renderers/focus/focus-tap";
import {
	type TypewriterHandle,
	typewriterRate,
} from "@/features/reader/renderers/focus/focus-typewriter";
import { applyReaderDocumentChrome } from "@/features/reader/renderers/shared/reader-document-chrome";
import {
	buildReaderClasses,
	buildReaderStyle,
} from "@/features/reader/renderers/shared/reader-style";
import { createTextReaderSession } from "@/features/reader/session/text-reader-session";
import { ReaderLoadingOverlay } from "@/features/reader/ui/chrome/reader-loading-overlay";
import { useWindowEvent } from "@/hooks/use-window-event";

interface BookReaderFocusProps extends BaseReaderProps {
	focusDocument: FocusDocument | null;
	preparationError: boolean;
	textSpeed: FocusTextSpeed;
	sentenceIndicator: boolean;
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
	language,
	focusDocument,
	preparationError,
	textSpeed,
	sentenceIndicator,
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
	onPositionChange,
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
	const typewriterRef = useRef<TypewriterHandle | null>(null);
	const typesRef = useRef(textSpeed !== "instant");
	typesRef.current = textSpeed !== "instant";
	const onPositionChangeRef = useRef(onPositionChange);
	onPositionChangeRef.current = onPositionChange;
	const onSectionProgressChangeRef = useRef(onSectionProgressChange);
	onSectionProgressChangeRef.current = onSectionProgressChange;
	const disableWheelNavigationRef = useRef(disableWheelNavigation);
	disableWheelNavigationRef.current = disableWheelNavigation;
	const navigationBlockedRef = useRef(navigationBlocked);
	navigationBlockedRef.current = navigationBlocked;

	const [current, setCurrent] = useState({ index: 0, animate: false });
	const [typing, setTyping] = useState(false);
	useEffect(
		() =>
			applyReaderDocumentChrome({
				mode: "focus",
				verticalMode,
				backgroundColor: theme.backgroundColor,
			}),
		[theme.backgroundColor, verticalMode],
	);
	const textSession = createTextReaderSession({
		sections,
		getCharacterCount: () => parsedRef.current?.totalCharacters ?? 0,
	});
	const positionForCharacter = textSession.positionFor;

	const updateSectionProgress = (
		exploredCharacter: number,
		parsed: FocusDocument,
	) => {
		onSectionProgressChangeRef.current(
			textSession.sectionProgressFor(exploredCharacter, parsed.sectionRanges),
		);
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
		options: { preservePosition?: number; animate?: boolean } = {},
	) => {
		const parsed = parsedRef.current;
		if (!parsed?.sentences.length) return;
		const nextIndex = clamp(requestedIndex, 0, parsed.sentences.length - 1);
		const sentence = parsed.sentences[nextIndex];
		if (!sentence) return;
		currentIndexRef.current = nextIndex;
		setCurrent({ index: nextIndex, animate: options.animate ?? false });
		const exploredCharacter =
			options.preservePosition ?? sentence.startCharacter;
		precisePositionRef.current = exploredCharacter;
		onPositionChangeRef.current(positionForCharacter(exploredCharacter));
		scheduleSectionProgress(exploredCharacter, parsed);
	};

	const moveSentence = (direction: -1 | 1) => {
		const parsed = parsedRef.current;
		if (!parsed?.sentences.length) return;
		if (direction === 1 && typewriterRef.current) {
			typewriterRef.current.finish();
			return;
		}
		const currentIndex = currentIndexRef.current;
		const requested = currentIndex + direction;
		if (requested < 0) return;
		if (requested >= parsed.sentences.length) {
			precisePositionRef.current = parsed.totalCharacters;
			onPositionChangeRef.current(positionForCharacter(parsed.totalCharacters));
			updateSectionProgress(parsed.totalCharacters, parsed);
			return;
		}
		showSentence(requested, {
			animate: direction === 1 && typesRef.current,
		});
	};

	// This adapter is registered when the session document becomes available.
	// The registered operations deliberately stay stable across visual settings;
	// their mutable state lives in refs, not in a second reader session.
	// biome-ignore lint/correctness/useExhaustiveDependencies: focusDocument is the session lifecycle; the callbacks read current refs
	useEffect(() => {
		if (!focusDocument) return;
		const parsed = focusDocument;
		parsedRef.current = parsed;
		const initialCharacter = initialPosition?.exploredCharCount ?? 0;
		const initialIndex = findFocusSentenceIndex(
			parsed.sentences,
			initialCharacter,
		);
		currentIndexRef.current = initialIndex;
		precisePositionRef.current = initialCharacter;
		setCurrent({ index: initialIndex, animate: false });
		onPositionChangeRef.current(positionForCharacter(initialCharacter));
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
			getPosition: () => positionForCharacter(precisePositionRef.current),
			scrollToPosition: (position) => {
				navigateToCharacter(position.exploredCharCount);
			},
			relayout: (position) => {
				if (position) precisePositionRef.current = position.exploredCharCount;
			},
		});

		return () => {
			if (parsedRef.current === parsed) parsedRef.current = null;
			clearTimeout(progressTimerRef.current);
			apiRef(null);
		};
	}, [focusDocument]);

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

	const sentenceIndex = current.index;
	const sentence = focusDocument?.sentences[sentenceIndex];
	const isImageSentence = sentence?.kind === "image";
	const sentenceHtml = useMemo(
		() => (sentence ? focusSentenceHtml(document, sentence) : ""),
		[sentence],
	);
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

	const handleSurfaceClick = (event: ReactMouseEvent<HTMLElement>) => {
		if (navigationBlocked || !sentence) return;
		if (isOverlayEvent(event.nativeEvent)) return;
		if (window.getSelection()?.isCollapsed === false) return;
		const surface = event.currentTarget.getBoundingClientRect();
		moveSentence(
			focusTapDirection({
				clientX: event.clientX,
				left: surface.left,
				width: surface.width,
				verticalMode,
			}),
		);
	};

	return (
		// biome-ignore lint/a11y/useKeyWithClickEvents: sentence navigation has its own keybinds (PageUp/PageDown, arrows); this only adds the pointer affordance
		<section
			data-reader-renderer="text-focus"
			aria-label="Focus reader"
			lang={language || undefined}
			className="focus-reader-surface fixed inset-0 flex items-center justify-center overflow-hidden"
			style={{ backgroundColor: theme.backgroundColor }}
			onClick={handleSurfaceClick}
		>
			<div
				role="status"
				aria-live="polite"
				aria-atomic="true"
				aria-busy={typing}
				className={`${sentenceClasses} ${
					isImageSentence ? "book-content--focus-media" : "max-w-3xl"
				} relative z-[2] flex max-h-full w-full overflow-auto overscroll-contain`}
				style={sentenceStyle}
			>
				{sentence ? (
					<FocusSentenceView
						key={`${sentence.sectionReference}:${sentenceIndex}`}
						sentence={sentence}
						html={sentenceHtml}
						typeAt={current.animate ? typewriterRate(textSpeed) : null}
						showIndicator={sentenceIndicator}
						hideFurigana={hideFurigana}
						furiganaStyle={furiganaStyle}
						typewriterRef={typewriterRef}
						onTypingChange={setTyping}
					/>
				) : focusDocument ? (
					<p>No readable text found.</p>
				) : null}
			</div>
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
