import { useCallback, useMemo, useRef } from "react";
import { useReaderDispatch, useReaderState } from "@/context/reader-context";
import { useDocumentEvent } from "@/hooks/use-document-event";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useReaderSettings } from "@/hooks/use-reader-settings";
import { getBaseName } from "@/lib/epub";
import { SelectionToolbar } from "./selection-toolbar";

function patchImageUrls(html: string, imageMap: Map<string, string>): string {
	let result = html.replace(
		/<img\s+[^>]*src="([^"]+)"[^>]*>/gi,
		(match, src) => {
			const base = getBaseName(src);
			const url = imageMap.get(base);
			if (url) return match.replace(`src="${src}"`, `src="${url}"`);
			return match;
		},
	);
	result = result.replace(
		/<image\s+[^>]*xlink:href="([^"]+)"[^>]*>/gi,
		(match, href) => {
			const base = getBaseName(href);
			const url = imageMap.get(base);
			if (url)
				return match.replace(`xlink:href="${href}"`, `xlink:href="${url}"`);
			return match;
		},
	);
	return result;
}

export function ReaderContent({ imageMap }: { imageMap: Map<string, string> }) {
	const state = useReaderState();
	const dispatch = useReaderDispatch();
	const [settings] = useReaderSettings();

	const containerRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const startXRef = useRef(0);

	// Guard: block flipPage during section transitions to prevent rapid backward jumps
	const sectionTransitionRef = useRef(false);

	const { paginated, vertical } = settings;

	// Memoize styles
	const containerStyle = useMemo(() => {
		const general = { fontFamily: "var(--app-font, inherit)" } as const;
		if (paginated && vertical) {
			return {
				...general,
				overflowY: "hidden" as const,
				margin: "auto",
				width: "100dvw",
				height: "100%",
			};
		}
		if (!paginated && vertical) {
			return {
				...general,
				overflowY: "hidden" as const,
				width: "100%",
				height: "100dvh",
			};
		}
		return {
			...general,
			overflowX: "hidden" as const,
			width: "100dvw",
			height: "100%",
		};
	}, [paginated, vertical]);

	const contentStyle = useMemo(() => {
		const vp =
			typeof window !== "undefined"
				? `${window.innerHeight * (settings.verticalPadding / 100)}px`
				: "0px";
		const hp =
			typeof window !== "undefined"
				? `${window.innerWidth * (settings.horizontalPadding / 100)}px`
				: "0px";

		const general = {
			margin: "auto",
			fontFamily: settings.fontFamily ?? undefined,
			fontSize: `${settings.fontSize}px`,
			lineHeight: `${settings.lineHeight}`,
			padding: `${vp} ${hp}`,
		};

		if (paginated && vertical) {
			return {
				...general,
				writingMode: "vertical-rl" as const,
				overflowX: "hidden" as const,
				overflowY: "hidden" as const,
				width: "var(--reader-width, 100vw)",
				height: "calc(var(--reader-height, 100vh) - 2em * 2)",
				columnGap: `calc(${vp} * 2)`,
				columnWidth: `calc(var(--reader-width, 100vw) - ${vp} * 2)`,
				columnFill: "auto" as const,
			};
		}
		if (paginated && !vertical) {
			return {
				...general,
				overflowY: "hidden" as const,
				overflowX: "hidden" as const,
				height: "var(--reader-height, 100vh)",
				width: "calc(var(--reader-width, 100vw) - 2em * 2)",
				columnGap: `calc(${hp} * 2)`,
				columnWidth: `calc(var(--reader-width, 100vw) - ${hp} * 2)`,
				columnFill: "auto" as const,
			};
		}
		if (!paginated && vertical) {
			return {
				...general,
				writingMode: "vertical-rl" as const,
				overflowY: "hidden" as const,
				height: "calc(var(--reader-height, 100vh) - 2em * 2)",
			};
		}
		// continuous horizontal
		return {
			...general,
			height: "100%",
			width: "calc(var(--reader-width, 100vw) - 2em * 2)",
		};
	}, [settings, paginated, vertical]);

	const flipPage = useCallback(
		(multiplier: 1 | -1) => {
			const content = contentRef.current;
			if (!content || sectionTransitionRef.current) return;

			let isStart: boolean;
			let isEnd: boolean;

			if (vertical) {
				isStart = content.scrollTop === 0;
				isEnd =
					Math.ceil(content.scrollTop + content.clientHeight) >=
					content.scrollHeight;
			} else {
				isStart = content.scrollLeft === 0;
				isEnd =
					Math.ceil(content.scrollLeft + content.clientWidth) >=
					content.scrollWidth;
			}

			if (isStart && multiplier === -1) {
				if (state.currSection === 0) return;
				sectionTransitionRef.current = true;
				dispatch.setSection(state.currSection - 1);
				requestAnimationFrame(() => {
					if (vertical) {
						content.scrollTo({
							top: content.scrollHeight,
							behavior: "instant",
						});
					} else {
						content.scrollTo({
							left: content.scrollWidth,
							behavior: "instant",
						});
					}
					sectionTransitionRef.current = false;
					dispatch.updateChars(paginated, vertical);
				});
				return;
			}
			if (isEnd && multiplier === 1) {
				if (state.currSection === state.book.sections.length - 1) return;
				sectionTransitionRef.current = true;
				dispatch.setSection(state.currSection + 1);
				requestAnimationFrame(() => {
					if (vertical) {
						content.scrollTo({ top: 0, behavior: "instant" });
					} else {
						content.scrollTo({ left: 0, behavior: "instant" });
					}
					sectionTransitionRef.current = false;
					dispatch.updateChars(paginated, vertical);
				});
				return;
			}

			const offset = vertical ? content.clientHeight : content.clientWidth;
			const current = vertical ? content.scrollTop : content.scrollLeft;
			const max = vertical ? content.scrollHeight : content.scrollWidth;
			const next = Math.max(
				0,
				Math.min(Math.ceil(current + offset * multiplier), max),
			);

			const scrollToOpts = vertical ? { top: next } : { left: next };
			content.scrollTo({ ...scrollToOpts, behavior: "instant" });
			dispatch.updateChars(paginated, vertical);
		},
		[
			vertical,
			paginated,
			state.currSection,
			state.book.sections.length,
			dispatch,
		],
	);

	// Keep a ref to flipPage so event listeners registered once never go stale
	const flipPageRef = useRef(flipPage);
	flipPageRef.current = flipPage;

	// Keyboard navigation
	useDocumentEvent("keydown", (e: KeyboardEvent) => {
		if (vertical) {
			if (e.key === "ArrowLeft") flipPage(1);
			else if (e.key === "ArrowRight") flipPage(-1);
		} else {
			if (e.key === "ArrowRight") flipPage(1);
			else if (e.key === "ArrowLeft") flipPage(-1);
		}

		if (e.key === "ArrowDown" || e.key === "PageDown") flipPage(1);
		else if (e.key === "ArrowUp" || e.key === "PageUp") flipPage(-1);
	});

	// Touch swipe — use flipPageRef so the listener registered once never goes stale
	const handleTouchStart = useCallback((e: TouchEvent) => {
		startXRef.current = e.touches[0].clientX;
	}, []);

	const handleTouchEnd = useCallback(
		(e: TouchEvent) => {
			const delta = e.changedTouches[0].clientX - startXRef.current;
			if (Math.abs(delta) > 50) {
				if (vertical) {
					flipPageRef.current(delta < 0 ? -1 : 1);
				} else {
					flipPageRef.current(delta < 0 ? 1 : -1);
				}
			}
		},
		[vertical],
	);

	// Wheel events — throttle in paginated mode to one flip per gesture
	const lastWheelFlipRef = useRef(0);
	const handleWheel = useCallback(
		(e: WheelEvent) => {
			if (paginated) {
				const now = Date.now();
				if (now - lastWheelFlipRef.current < 200) return;
				lastWheelFlipRef.current = now;
				flipPageRef.current(e.deltaY > 0 ? 1 : -1);
			} else if (!paginated && vertical && containerRef.current) {
				containerRef.current.scrollLeft -= e.deltaY;
			}
		},
		[paginated, vertical],
	);

	// Setup resize, CSS, furigana, scroll
	useMountEffect(() => {
		const container = containerRef.current;
		const content = contentRef.current;
		if (!container || !content) return;

		// Setup resize handler
		const handleResize = () => {
			container.style.setProperty("--reader-height", `${window.innerHeight}px`);
			container.style.setProperty("--reader-width", `${window.innerWidth}px`);
			container.style.setProperty(
				"--reader-image-height",
				`calc(${window.innerHeight - 2 * window.innerHeight * (settings.verticalPadding / 100)}px - 2em)`,
			);
			container.style.setProperty(
				"--reader-image-width",
				`calc(${window.innerWidth - 2 * window.innerWidth * (settings.horizontalPadding / 100)}px - 2em)`,
			);

			if (paginated && !vertical) {
				const col = Math.round(content.scrollLeft / content.clientWidth);
				content.scrollLeft = col * content.clientWidth;
			} else if (paginated && vertical) {
				const col = Math.round(content.scrollTop / content.clientHeight);
				content.scrollTop = col * content.clientHeight;
			}
		};
		handleResize();
		window.addEventListener("resize", handleResize);

		// Scroll handling for continuous mode
		let scrollTimer: ReturnType<typeof setTimeout> | null = null;
		const handleScrollContinuous = () => {
			if (scrollTimer !== null) clearTimeout(scrollTimer);
			scrollTimer = setTimeout(() => {
				dispatch.updateChars(paginated, vertical);
			}, 300);
		};

		// Touch and wheel events
		if (paginated) {
			container.addEventListener("touchstart", handleTouchStart as any);
			container.addEventListener("touchend", handleTouchEnd as any);
			container.addEventListener("wheel", handleWheel as any);
		} else {
			container.addEventListener("scroll", handleScrollContinuous);
			if (vertical) {
				container.addEventListener("wheel", handleWheel as any);
			}
		}

		// CSS injection
		if (!settings.disableCss) {
			const bookStyle = state.book.getCssStyle();
			bookStyle.id = "book-css";
			document.head.appendChild(bookStyle);
		}

		// Furigana
		if (!settings.showFurigana) {
			document.body.classList.add("hide-furigana");
		}

		// Scroll to current position
		requestAnimationFrame(() => {
			const currPosition = state.book.currParagraph;
			document
				.querySelector(`[index="${currPosition}"]`)
				?.scrollIntoView({ inline: "center" });
		});

		return () => {
			window.removeEventListener("resize", handleResize);
			container.style.removeProperty("--reader-height");
			container.style.removeProperty("--reader-width");
			container.style.removeProperty("--reader-image-height");
			container.style.removeProperty("--reader-image-width");

			if (paginated) {
				container.removeEventListener("touchstart", handleTouchStart as any);
				container.removeEventListener("touchend", handleTouchEnd as any);
				container.removeEventListener("wheel", handleWheel as any);
			} else {
				container.removeEventListener("scroll", handleScrollContinuous);
				if (vertical) {
					container.removeEventListener("wheel", handleWheel as any);
				}
			}

			document.head.querySelector("#book-css")?.remove();
			document.body.classList.remove("hide-furigana");
		};
	});

	// Highlight bookmarks when section changes
	const prevSectionRef = useRef(state.currSection);
	if (state.currSection !== prevSectionRef.current) {
		prevSectionRef.current = state.currSection;
		requestAnimationFrame(() =>
			highlightBookmarks(state.book.bookmarks, contentRef.current),
		);
	}

	// Pre-patch all section HTML once — avoids reprocessing on every render
	const patchedSections = useMemo(
		() =>
			state.book.sections.map((section) => ({
				name: section.name,
				html: patchImageUrls(section.content, imageMap),
			})),
		[state.book.sections, imageMap],
	);

	// Render content based on mode
	const renderContent = () => {
		if (paginated) {
			const patched = patchedSections[state.currSection];
			if (!patched) return null;
			return (
				<div
					dangerouslySetInnerHTML={{
						__html: patched.html,
					}}
				/>
			);
		}
		// Continuous mode: render all sections
		return patchedSections.map((patched) => (
			<div
				key={patched.name}
				dangerouslySetInnerHTML={{
					__html: patched.html,
				}}
			/>
		));
	};

	return (
		<>
			<div
				ref={containerRef}
				style={containerStyle}
				onClick={() => {
					dispatch.closeNavbar();
					dispatch.setSidebar(null);
				}}
			>
				<div id="reader-content" ref={contentRef} style={contentStyle}>
					{renderContent()}
				</div>
			</div>

			<SelectionToolbar />
		</>
	);
}

const BOOKMARK_CLASSES = ["bg-amber-100", "dark:bg-amber-900/30"];

function highlightBookmarks(
	bookmarks: { paragraphId: number }[],
	contentEl: HTMLDivElement | null,
) {
	if (!contentEl) return;
	const bookmarksIds = new Set(bookmarks.map((b) => b.paragraphId));
	const ptags = contentEl.querySelectorAll("p[index]");

	for (const p of ptags) {
		const index = Number(p.getAttribute("index"));
		if (bookmarksIds.has(index)) {
			p.classList.add(...BOOKMARK_CLASSES);
		} else {
			p.classList.remove(...BOOKMARK_CLASSES);
		}
	}
}
