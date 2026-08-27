import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { FuriganaStyle } from "@/features/reader/presentation/settings";
import type { FocusSentence } from "@/features/reader/renderers/focus/focus-sentences";
import {
	insertSentenceIndicator,
	prepareTypewriter,
	runTypewriter,
	type TypewriterHandle,
} from "@/features/reader/renderers/focus/focus-typewriter";
import { handleReaderContentClick } from "@/features/reader/renderers/shared/reader-content-click";
import { useMountEffect } from "@/hooks/use-mount-effect";

interface FocusSentenceViewProps {
	sentence: FocusSentence;
	html: string;
	typeAt: number | null;
	showIndicator: boolean;
	hideFurigana: boolean;
	furiganaStyle: FuriganaStyle;
	typewriterRef: RefObject<TypewriterHandle | null>;
	onTypingChange: (typing: boolean) => void;
}

const prefersReducedMotion = () =>
	typeof window !== "undefined" &&
	window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export function FocusSentenceView({
	sentence,
	html,
	typeAt,
	showIndicator,
	hideFurigana,
	furiganaStyle,
	typewriterRef,
	onTypingChange,
}: FocusSentenceViewProps) {
	const contentRef = useRef<HTMLDivElement | null>(null);
	const showIndicatorRef = useRef(showIndicator);
	const settledRef = useRef(false);
	const lastGlyphRef = useRef<HTMLElement | undefined>(undefined);
	showIndicatorRef.current = showIndicator;

	const syncIndicator = (root: HTMLElement) => {
		root.querySelector(".focus-sentence-indicator")?.remove();
		if (!showIndicatorRef.current || sentence.kind !== "text") return;
		insertSentenceIndicator(root, lastGlyphRef.current);
	};

	useMountEffect(() => {
		const root = contentRef.current;
		if (!root) return;
		root.innerHTML = html;
		let watcher: ResizeObserver | undefined;
		const settle = (lastGlyph?: HTMLElement) => {
			typewriterRef.current = null;
			onTypingChange(false);
			settledRef.current = true;
			lastGlyphRef.current = lastGlyph;
			syncIndicator(root);
			if (sentence.kind !== "text") return;
			watcher = new ResizeObserver(() => syncIndicator(root));
			watcher.observe(root);
		};
		if (
			typeAt === null ||
			sentence.kind === "image" ||
			prefersReducedMotion()
		) {
			settle();
			return () => watcher?.disconnect();
		}
		const steps = prepareTypewriter(root);
		if (!steps.length) {
			settle();
			return () => watcher?.disconnect();
		}
		onTypingChange(true);
		const handle = runTypewriter(steps, {
			charactersPerSecond: typeAt,
			onFinish: () => settle(steps.at(-1)?.element),
		});
		typewriterRef.current = handle;
		return () => {
			handle.stop();
			watcher?.disconnect();
			if (typewriterRef.current === handle) typewriterRef.current = null;
			onTypingChange(false);
		};
	});

	useEffect(() => {
		const root = contentRef.current;
		if (!root || !settledRef.current) return;
		root.querySelector(".focus-sentence-indicator")?.remove();
		if (showIndicator && sentence.kind === "text") {
			insertSentenceIndicator(root, lastGlyphRef.current);
		}
	}, [showIndicator, sentence.kind]);

	return (
		<div
			ref={contentRef}
			id={sentence.sectionReference}
			data-focus-fragment-ids={JSON.stringify(sentence.fragmentIds)}
			role="document"
			// biome-ignore lint/a11y/noNoninteractiveTabindex: the rendered publication is a keyboard surface for furigana and Read & Listen sentence seeking
			tabIndex={0}
			className="focus-sentence-content min-h-fit min-w-fit"
			onClick={(event) => {
				if (
					handleReaderContentClick(
						event.nativeEvent,
						{ hideFurigana, furiganaStyle },
						() => {},
					)
				) {
					event.stopPropagation();
				}
			}}
			onKeyDown={(event) => {
				if (
					event.key !== "Enter" ||
					!hideFurigana ||
					(furiganaStyle !== "Toggle" && furiganaStyle !== "Full")
				) {
					return;
				}
				for (const ruby of contentRef.current?.querySelectorAll("ruby") ?? []) {
					if (furiganaStyle === "Toggle") {
						ruby.classList.toggle("reveal-rt");
					} else {
						ruby.classList.add("reveal-rt");
					}
				}
			}}
		/>
	);
}
