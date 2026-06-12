import { ORPCError } from "@orpc/client";
import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	useLoaderData,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
	type BookReaderApi,
	BookReaderContinuous,
	type SectionWithProgress,
} from "@/components/reader/book-reader-continuous";
import { BookReaderPaginated } from "@/components/reader/book-reader-paginated";
import { ReaderFooter } from "@/components/reader/reader-footer";
import { ReaderHeader } from "@/components/reader/reader-header";
import { ReaderImageGallery } from "@/components/reader/reader-image-gallery";
import { ReaderLoadingScreen } from "@/components/reader/reader-loading-screen";
import { ReaderSettingsOverlay } from "@/components/reader/reader-settings";
import { ReaderToc } from "@/components/reader/reader-toc";
import { useBookLoader } from "@/components/reader/use-book-loader";
import { useReaderKeybinds } from "@/components/reader/use-reader-keybinds";
import { useReaderSync } from "@/components/reader/use-reader-sync";
import { getBook } from "@/functions/books/get-book";
import { useSyncActiveOrg } from "@/hooks/use-sync-active-org";
import { saveLocalBookmark } from "@/lib/reader/local-bookmark";
import {
	type CustomReaderThemes,
	getReaderScrollbarColor,
	getReaderTheme,
	loadCustomThemes,
	loadReaderSettings,
	type ReaderSettings,
	saveCustomThemes,
	saveReaderSettings,
} from "@/lib/reader/settings";
import type { ReaderBookmark } from "@/lib/reader/types";
import { client } from "@/utils/orpc";
import "@/components/reader/reader.css";
// Bundled CJK fonts: vertical-rl text renders garbled glyph overlaps when the
// requested family is missing and the system serif lacks vertical metrics.
import "@fontsource/noto-serif-jp/400.css";
import "@fontsource/noto-serif-jp/700.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/700.css";

export const Route = createFileRoute("/reader/$uuid")({
	component: ReaderPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
	loader: async ({ params }) => {
		try {
			const { book, switchedOrgId } = await getBook({ data: params.uuid });
			return { book, switchedOrgId };
		} catch (error) {
			if (error instanceof ORPCError && error.status === 404) {
				throw notFound();
			}
			// offline: the reader can still serve the book from IndexedDB
			return { book: null, switchedOrgId: null };
		}
	},
});

/** Settings that change the book layout but apply live (no remount). */
const LAYOUT_SETTING_KEYS = new Set<string>([
	"fontFamilyGroupOne",
	"fontFamilyGroupTwo",
	"fontWeight",
	"fontSize",
	"lineHeight",
	"textIndentation",
	"textMarginMode",
	"textMarginValue",
	"verticalTextOrientation",
	"enableFontKerning",
	"enableFontVPAL",
	"prioritizeReaderStyles",
	"enableTextJustification",
	"enableTextWrapPretty",
	"secondDimensionMaxValue",
	"firstDimensionMargin",
	"hideFurigana",
	"furiganaStyle",
	"hideSpoilerImage",
	"avoidPageBreak",
	"pageColumns",
]);

export function ReaderPage() {
	const { book, switchedOrgId } = useLoaderData({ from: "/reader/$uuid" });
	const { uuid } = Route.useParams();
	const navigate = useNavigate();

	useSyncActiveOrg(switchedOrgId);

	const [settings, setSettings] = useState<ReaderSettings>(loadReaderSettings);
	const [customThemes, setCustomThemes] =
		useState<CustomReaderThemes>(loadCustomThemes);
	// Ref so the draft theme preview resolves themes saved in the same tick
	// (the dialog commits the theme colors and selects the theme back to back).
	const customThemesRef = useRef(customThemes);
	// While the settings overlay is open, edits go to this draft; the reader
	// keeps rendering the committed settings (zero relayouts between toggles)
	// and everything is applied in one commit when the overlay closes.
	const [draftSettings, setDraftSettings] = useState<ReaderSettings | null>(
		null,
	);
	const [showHeader, setShowHeader] = useState(false);
	const [tocOpen, setTocOpen] = useState(false);
	const [galleryOpen, setGalleryOpen] = useState(false);
	const settingsOpen = draftSettings !== null;
	const [exploredCharCount, setExploredCharCount] = useState(0);
	const [sectionProgress, setSectionProgress] = useState<
		Map<string, SectionWithProgress>
	>(new Map());
	const [bookmark, setBookmark] = useState<ReaderBookmark | undefined>(
		undefined,
	);
	const [isBookmarkScreen, setIsBookmarkScreen] = useState(false);

	const apiRef = useRef<BookReaderApi | null>(null);
	const exploredRef = useRef(0);
	const bookCharCountRef = useRef(0);
	const autoBookmarkTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
	const bookmarkRef = useRef<ReaderBookmark | undefined>(undefined);
	bookmarkRef.current = bookmark;

	const bookTitle = book?.title ?? book?.filename ?? "Book";

	const loadState = useBookLoader({
		uuid,
		bookTitle,
		cover: book?.cover ?? null,
		fileSizeBytes: book?.filesizeKb ? book.filesizeKb * 1024 : undefined,
		onLoaded: ({ data, bookmark: initial }) => {
			bookCharCountRef.current = data.characters;
			// The restored bookmark is also the displayed marker.
			setBookmark(initial);
		},
	});

	// The bookmark is the source of truth for the position: the server sync
	// carries the bookmark's char count (not the live scroll position), so
	// other devices restore to the bookmark too.
	const getCharCounts = useCallback(
		() => ({
			exploredCharCount: bookmarkRef.current?.exploredCharCount,
			bookCharCount: bookCharCountRef.current,
		}),
		[],
	);

	useReaderSync({
		bookUuid: uuid,
		enabled: loadState.phase === "ready" && bookCharCountRef.current > 0,
		getCharCounts,
	});

	const bookmarkPage = useCallback(() => {
		const data = apiRef.current?.getBookmark();
		if (!data?.exploredCharCount) return;
		setBookmark(data);
		saveLocalBookmark(uuid, data);
		apiRef.current?.showBookmarkMarker(data);
		setIsBookmarkScreen(true);
	}, [uuid]);

	const handleExploredChange = (count: number, programmatic = false) => {
		if (count === exploredRef.current) return;
		exploredRef.current = count;
		setExploredCharCount(count);
		setIsBookmarkScreen(
			!!bookmarkRef.current && bookmarkRef.current.exploredCharCount === count,
		);

		// ttu auto bookmark: persist position after N seconds without scrolling.
		// Programmatic changes (restore, resize/image-load corrections) must
		// not rewrite the bookmark — only the user moving through the book.
		if (settings.autoBookmark && !programmatic) {
			clearTimeout(autoBookmarkTimerRef.current);
			autoBookmarkTimerRef.current = setTimeout(() => {
				const data = apiRef.current?.getBookmark();
				if (data?.exploredCharCount) {
					setBookmark(data);
					saveLocalBookmark(uuid, data);
					apiRef.current?.showBookmarkMarker(data);
				}
			}, settings.autoBookmarkTime * 1000);
		}
	};

	// Direct commit path, used by keybinds while the overlay is closed
	// (autoscroll speed) — these never touch the book layout.
	const handleSettingsChange = (patch: Partial<ReaderSettings>) => {
		setSettings((prev) => {
			const next = { ...prev, ...patch };
			saveReaderSettings(next);
			return next;
		});
	};

	const handleCustomThemesChange = (next: CustomReaderThemes) => {
		customThemesRef.current = next;
		setCustomThemes(next);
		saveCustomThemes(next);
	};

	const handleDraftChange = (patch: Partial<ReaderSettings>) => {
		// Theme previews instantly: the overlay surface and body background use
		// it; the book behind the (opaque) overlay updates on commit.
		if (patch.theme) {
			document.body.style.setProperty(
				"background-color",
				getReaderTheme(patch.theme, customThemesRef.current).backgroundColor,
			);
		}
		setDraftSettings((prev) => (prev ? { ...prev, ...patch } : prev));
	};

	// Fullscreen overlays (settings, gallery) can't cover the document's own
	// scrollbar (it paints in the viewport gutter, outside any element), so the
	// reader drops it entirely while one is up and re-anchors on restore.
	const hideDocumentScrollbar = () => {
		apiRef.current?.setScrollbarHidden(true);
	};

	const restoreDocumentScrollbar = (themeId: string) => {
		document.documentElement.style.setProperty(
			"scrollbar-color",
			`${getReaderScrollbarColor(getReaderTheme(themeId, customThemesRef.current))} transparent`,
		);
		apiRef.current?.setScrollbarHidden(false);
	};

	const openSettings = () => {
		hideDocumentScrollbar();
		setDraftSettings(settings);
	};

	const closeSettings = () => {
		const next = draftSettings;
		setDraftSettings(null);
		if (!next) return;

		restoreDocumentScrollbar(next.theme);
		saveReaderSettings(next);
		setSettings(next);

		const structuralChanged =
			next.viewMode !== settings.viewMode ||
			next.writingMode !== settings.writingMode;
		const layoutChanged = [...LAYOUT_SETTING_KEYS].some(
			(key) =>
				next[key as keyof ReaderSettings] !==
				settings[key as keyof ReaderSettings],
		);

		// Structural changes remount (the remount measures from scratch);
		// other layout changes re-measure in place after React commits.
		if (!structuralChanged && layoutChanged) {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					apiRef.current?.relayout();
				});
			});
		}
	};

	const changeChapter = useCallback(
		(offset: number) => {
			const chapters = [...sectionProgress.values()].filter(
				(section) => !section.parentChapter,
			);
			if (!chapters.length) return;

			let currentIndex = chapters.findIndex(
				(section) => section.progress < 100,
			);
			if (currentIndex === -1) currentIndex = chapters.length - 1;

			const target = chapters[currentIndex + offset];
			if (target) apiRef.current?.navigateToSection(target.reference);
		},
		[sectionProgress],
	);

	const verticalMode = settings.writingMode === "vertical-rl";
	const theme = getReaderTheme(settings.theme, customThemes);

	// Stable wrapper identity: React 19 rewrites the <style> contents whenever
	// the {__html} object identity changes, and replacing the book's stylesheet
	// forces a full restyle+relayout of the (huge) book document — this froze
	// scrolling at ~2 FPS on long books.
	const styleSheetHtml = useMemo(
		() => ({
			__html: loadState.phase === "ready" ? loadState.data.styleSheet : "",
		}),
		[loadState],
	);

	// Book images in document order for the gallery (ttu: spoilered by default
	// in paginated mode, revealed in continuous).
	const galleryPictures = useMemo(() => {
		if (loadState.phase !== "ready") return [];
		const urls = loadState.html.match(/blob:[^"')\s]+/g) ?? [];
		return [...new Set(urls)].map((url) => ({
			url,
			unspoilered: settings.viewMode !== "paginated",
		}));
	}, [loadState, settings.viewMode]);

	useReaderKeybinds({
		apiRef,
		bookmarkRef,
		isPaginated: settings.viewMode === "paginated",
		verticalMode,
		autoScrollMultiplier: settings.autoScrollMultiplier,
		galleryOpen,
		tocOpen,
		settingsOpen,
		onBookmark: bookmarkPage,
		onCloseToc: () => setTocOpen(false),
		onCloseSettings: closeSettings,
		onChangeChapter: changeChapter,
		onAutoScrollMultiplierChange: (next) => {
			handleSettingsChange({ autoScrollMultiplier: next });
			apiRef.current?.setAutoScrollMultiplier(next);
		},
	});

	const completeBook = () => {
		const total = bookCharCountRef.current;
		client.readingProgress
			.saveProgress({
				bookUuid: uuid,
				exploredCharCount: total,
				bookCharCount: total,
				status: "completed",
			})
			.catch(() => {});
		navigate({ to: "/dashboard/books/$uuid", params: { uuid } });
	};

	const onFullscreenClick = () => {
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		} else {
			document.documentElement.requestFullscreen().catch(() => {});
		}
	};

	if (loadState.phase === "error") {
		return (
			<div className="flex h-screen flex-col items-center justify-center gap-4">
				<p className="text-destructive text-lg">{loadState.message}</p>
				<Link
					to="/dashboard/books/$uuid"
					params={{ uuid }}
					className="underline"
				>
					Back to book
				</Link>
			</div>
		);
	}

	if (loadState.phase !== "ready") {
		return <ReaderLoadingScreen state={loadState} />;
	}

	const { data, html } = loadState;
	// Structural remounts (view/writing mode change) restore the position the
	// reader was at, not the original load-time position.
	const initialPosition =
		exploredRef.current > 0
			? {
					exploredCharCount: exploredRef.current,
					progress: data.characters ? exploredRef.current / data.characters : 0,
					lastBookmarkModified: Date.now(),
				}
			: loadState.bookmark;

	// Only truly structural settings remount the reader (different component /
	// different scroll axis). Everything else — fonts, sizes, margins, furigana,
	// columns, theme — applies live via re-render + api.relayout(). The reader
	// always renders the committed settings, so draft edits in the overlay
	// never touch it until closeSettings().
	const readerKey = [uuid, settings.viewMode, settings.writingMode].join("|");

	const sharedReaderProps = {
		htmlContent: html,
		verticalMode,
		theme,
		fontFamilyGroupOne: settings.fontFamilyGroupOne,
		fontFamilyGroupTwo: settings.fontFamilyGroupTwo,
		fontWeight: settings.fontWeight,
		fontSize: settings.fontSize,
		lineHeight: settings.lineHeight,
		textIndentation: settings.textIndentation,
		textMarginMode: settings.textMarginMode,
		textMarginValue: settings.textMarginValue,
		verticalTextOrientation: settings.verticalTextOrientation,
		enableFontKerning: settings.enableFontKerning,
		enableFontVPAL: settings.enableFontVPAL,
		prioritizeReaderStyles: settings.prioritizeReaderStyles,
		enableTextJustification: settings.enableTextJustification,
		enableTextWrapPretty: settings.enableTextWrapPretty,
		secondDimensionMaxValue: settings.secondDimensionMaxValue,
		firstDimensionMargin: settings.firstDimensionMargin,
		hideFurigana: settings.hideFurigana,
		furiganaStyle: settings.furiganaStyle,
		hideSpoilerImage: settings.hideSpoilerImage,
		disableWheelNavigation: settings.disableWheelNavigation,
		sections: data.sections,
		initialPosition,
		initialBookmark: bookmark,
		onExploredCharCountChange: handleExploredChange,
		onSectionProgressChange: setSectionProgress,
		apiRef: (api: BookReaderApi | null) => {
			apiRef.current = api;
		},
	};

	return (
		<div style={{ backgroundColor: theme.backgroundColor }}>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: book stylesheet sanitized by formatStyleSheet */}
			<style dangerouslySetInnerHTML={styleSheetHtml} />

			{settings.viewMode === "paginated" ? (
				<BookReaderPaginated
					key={readerKey}
					{...sharedReaderProps}
					avoidPageBreak={settings.avoidPageBreak}
					pageColumns={settings.pageColumns}
				/>
			) : (
				<BookReaderContinuous
					key={readerKey}
					{...sharedReaderProps}
					autoPositionOnResize={settings.autoPositionOnResize}
					autoScrollMultiplier={settings.autoScrollMultiplier}
					onAutoScrollChange={() => {}}
				/>
			)}

			{/* ttu: invisible strip at the top shows the header. Physical left/right
			    (not inset-x, which is logical and breaks under vertical-rl). */}
			<button
				type="button"
				aria-label="Show reader menu"
				className="writing-horizontal-tb fixed top-0 right-0 left-0 z-10 h-8"
				onClick={() => setShowHeader(true)}
			/>
			{showHeader && (
				<>
					<button
						type="button"
						aria-label="Hide reader menu"
						className="fixed inset-0 z-[9]"
						onClick={() => setShowHeader(false)}
					/>
					<div className="writing-horizontal-tb fixed top-0 right-0 left-0 z-10 shadow-lg">
						<ReaderHeader
							hasChapterData={sectionProgress.size > 0}
							autoScrollMultiplier={
								settings.viewMode === "continuous"
									? settings.autoScrollMultiplier
									: undefined
							}
							isBookmarkScreen={isBookmarkScreen}
							hasBookmarkData={!!bookmark}
							onTocClick={() => {
								setShowHeader(false);
								setTocOpen(true);
							}}
							onBookmarkClick={() => {
								setShowHeader(false);
								bookmarkPage();
							}}
							onScrollToBookmarkClick={() => {
								setShowHeader(false);
								if (bookmarkRef.current) {
									apiRef.current?.scrollToBookmark(bookmarkRef.current);
								}
							}}
							onCompleteBook={completeBook}
							onFullscreenClick={onFullscreenClick}
							hasImages={galleryPictures.length > 0}
							onImageGalleryClick={() => {
								setShowHeader(false);
								hideDocumentScrollbar();
								setGalleryOpen(true);
							}}
							onSettingsClick={() => {
								setShowHeader(false);
								openSettings();
							}}
							onExitClick={() =>
								navigate({ to: "/dashboard/books/$uuid", params: { uuid } })
							}
						/>
					</div>
				</>
			)}

			<ReaderFooter
				theme={theme}
				exploredCharCount={exploredCharCount}
				bookCharCount={data.characters}
				showCharacterCounter={settings.showCharacterCounter}
				showPercentage={settings.showPercentage}
			/>

			{tocOpen && (
				<ReaderToc
					theme={theme}
					sectionProgress={sectionProgress}
					exploredCharCount={exploredCharCount}
					verticalMode={verticalMode}
					onNavigate={(reference) =>
						apiRef.current?.navigateToSection(reference)
					}
					onClose={() => setTocOpen(false)}
				/>
			)}

			{draftSettings && (
				<ReaderSettingsOverlay
					settings={draftSettings}
					customThemes={customThemes}
					currentBookUuid={uuid}
					onChange={handleDraftChange}
					onCustomThemesChange={handleCustomThemesChange}
					onClose={closeSettings}
				/>
			)}

			{galleryOpen && (
				<ReaderImageGallery
					theme={theme}
					pictures={galleryPictures}
					hideSpoilerImage={settings.hideSpoilerImage}
					onClose={() => {
						restoreDocumentScrollbar(settings.theme);
						setGalleryOpen(false);
					}}
				/>
			)}
		</div>
	);
}
