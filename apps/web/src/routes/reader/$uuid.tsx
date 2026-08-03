import { isReaderSupportedEbook } from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
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
import { ReaderQuickSettings } from "@/components/reader/reader-quick-settings";
import { ReaderSettingsOverlay } from "@/components/reader/reader-settings";
import { ReaderToc } from "@/components/reader/reader-toc";
import { useBookLoader } from "@/components/reader/use-book-loader";
import { useReaderKeybinds } from "@/components/reader/use-reader-keybinds";
import { useReaderSync } from "@/components/reader/use-reader-sync";
import { getBook } from "@/functions/books/get-book";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { usePresenceEvents } from "@/hooks/use-presence-events";
import { useSyncActiveOrg } from "@/hooks/use-sync-active-org";
import { authClient } from "@/lib/auth-client";
import {
	invalidateReadingProgress,
	invalidateRecommendations,
} from "@/lib/invalidate-progress";
import { saveLocalBookmark } from "@/lib/reader/local-bookmark";
import {
	commitCustomThemes,
	commitProfilesStore,
	createProfile,
	deleteProfile,
	duplicateProfile,
	getActiveProfileId,
	getProfileSettings,
	loadProfilesStore,
	type ReaderProfilesStore,
	renameProfile,
	setActiveProfileId,
	setProfileSettings,
	syncReaderProfiles,
} from "@/lib/reader/profiles";
import {
	type CustomReaderThemes,
	getReaderScrollbarColor,
	getReaderTheme,
	loadCustomThemes,
	type ReaderSettings,
	saveReaderSettings,
} from "@/lib/reader/settings";
import type { ReaderBookmark } from "@/lib/reader/types";
import { resetThemeColor, setThemeColor } from "@/lib/theme-color";
import { client } from "@/utils/orpc";
import "@/components/reader/reader.css";
// Bundled CJK fonts: vertical-rl text renders garbled glyph overlaps when the
// requested family is missing and the system serif lacks vertical metrics.
import "@fontsource/noto-serif-jp/japanese-400.css";
import "@fontsource/noto-serif-jp/japanese-700.css";
import "@fontsource/noto-sans-jp/japanese-400.css";
import "@fontsource/noto-sans-jp/japanese-700.css";

export const Route = createFileRoute("/reader/$uuid")({
	component: ReaderPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
	loader: async ({ params }) => {
		let resolved: Awaited<ReturnType<typeof getBook>>;
		try {
			resolved = await getBook({ data: params.uuid });
		} catch (error) {
			if (error instanceof ORPCError && error.status === 404) {
				throw notFound();
			}
			// offline: the reader can still serve the book from IndexedDB
			return { book: null, switchedOrgId: null };
		}
		if (!isReaderSupportedEbook(resolved.book.filename)) {
			throw redirect({
				to: "/dashboard/books/$uuid",
				params: { uuid: params.uuid },
			});
		}
		return resolved;
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

function ReaderPage() {
	const { book, switchedOrgId } = useLoaderData({ from: "/reader/$uuid" });
	const { uuid } = Route.useParams();
	const navigate = useNavigate();

	useSyncActiveOrg(switchedOrgId);

	// The reader is a full-page route outside DashboardLayout, so it would
	// otherwise drop the presence connection and flip the user to "away" mid-read.
	// Keeping the SSE alive here holds them "online" (and "reading" via the sync).
	usePresenceEvents();

	const [profilesStore, setProfilesStore] =
		useState<ReaderProfilesStore>(loadProfilesStore);
	const [activeProfileId, setActiveProfileIdState] = useState<string>(() =>
		getActiveProfileId(profilesStore),
	);
	const [settings, setSettings] = useState<ReaderSettings>(() =>
		getProfileSettings(profilesStore, activeProfileId),
	);
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
	const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
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
	// -1 = no report from the reader yet (0 is a real position: book start).
	const exploredRef = useRef(-1);
	const bookCharCountRef = useRef(0);
	const bookmarkRef = useRef<ReaderBookmark | undefined>(undefined);
	bookmarkRef.current = bookmark;
	// Read by the async profile-sync callback, which outlives a render.
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const draftSettingsRef = useRef(draftSettings);
	draftSettingsRef.current = draftSettings;

	const bookTitle = book?.title ?? book?.filename ?? "Book";
	const { data: activeOrg } = authClient.useActiveOrganization();
	// The book's server: its own org when opened cross-org, else the active one.
	const bookServerId = switchedOrgId ?? activeOrg?.id ?? null;

	const loadState = useBookLoader({
		uuid,
		bookTitle,
		cover: book?.cover ?? null,
		serverId: bookServerId,
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
		// Count 0 (the very start of the book) is a valid bookmark position.
		const data = apiRef.current?.getBookmark();
		if (!data) return;
		setBookmark(data);
		saveLocalBookmark(uuid, data);
		apiRef.current?.showBookmarkMarker(data);
		setIsBookmarkScreen(true);
	}, [uuid]);

	const handleExploredChange = (count: number) => {
		if (count === exploredRef.current) return;
		exploredRef.current = count;
		setExploredCharCount(count);
		setIsBookmarkScreen(
			!!bookmarkRef.current && bookmarkRef.current.exploredCharCount === count,
		);
	};

	// Direct commit path, used by keybinds while the overlay is closed
	// (autoscroll speed) — these never touch the book layout.
	const handleSettingsChange = (patch: Partial<ReaderSettings>) => {
		const next = { ...settings, ...patch };
		setSettings(next);
		setProfilesStore(
			commitProfilesStore(
				setProfileSettings(profilesStore, activeProfileId, next),
			),
		);
	};

	const handleCustomThemesChange = (next: CustomReaderThemes) => {
		customThemesRef.current = next;
		setCustomThemes(next);
		commitCustomThemes(next);
	};

	// Quick settings commit immediately (the book is visible behind the popover
	// and must react in real time). Structural keys remount via readerKey; the
	// rest re-measure in place — relayout() itself coalesces the slider-drag
	// bursts and waits out the React commit.
	const handleQuickSettingsChange = (patch: Partial<ReaderSettings>) => {
		handleSettingsChange(patch);
		if (Object.keys(patch).some((key) => LAYOUT_SETTING_KEYS.has(key))) {
			apiRef.current?.relayout();
		}
	};

	// Body background and the browser-chrome tint (theme-color meta) always
	// move together while reading.
	const applyReaderBackground = (color: string) => {
		document.body.style.setProperty("background-color", color);
		setThemeColor(color);
	};

	const handleDraftChange = (patch: Partial<ReaderSettings>) => {
		// Theme previews instantly: the overlay surface and body background use
		// it; the book behind the (opaque) overlay updates on commit.
		if (patch.theme) {
			applyReaderBackground(
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

	const applyCommittedSettings = (
		next: ReaderSettings,
		prev: ReaderSettings,
	) => {
		const structuralChanged =
			next.viewMode !== prev.viewMode || next.writingMode !== prev.writingMode;
		const layoutChanged = [...LAYOUT_SETTING_KEYS].some(
			(key) =>
				next[key as keyof ReaderSettings] !== prev[key as keyof ReaderSettings],
		);

		// Structural changes remount (the remount measures from scratch); other
		// layout changes re-measure in place (relayout waits out the commit).
		if (!structuralChanged && layoutChanged) {
			apiRef.current?.relayout();
		}
	};

	const closeSettings = () => {
		const next = draftSettings;
		setDraftSettings(null);
		if (!next) return;

		restoreDocumentScrollbar(next.theme);
		setSettings(next);
		setProfilesStore(
			commitProfilesStore(
				setProfileSettings(profilesStore, activeProfileId, next),
			),
		);
		applyCommittedSettings(next, settings);
	};

	// Swaps the live settings for another profile's (overlay closed): restyles
	// the page chrome and remounts/relayouts the book like a settings commit.
	const applyProfileSettings = (next: ReaderSettings) => {
		const prev = settingsRef.current;
		setSettings(next);
		const nextTheme = getReaderTheme(next.theme, customThemesRef.current);
		applyReaderBackground(nextTheme.backgroundColor);
		document.documentElement.style.setProperty(
			"scrollbar-color",
			`${getReaderScrollbarColor(nextTheme)} transparent`,
		);
		applyCommittedSettings(next, prev);
	};

	// Switching profiles doesn't modify the store (no push) — only the
	// per-device pointer and the legacy settings mirror move.
	const handleProfileSwitch = (id: string) => {
		if (id === activeProfileId) return;
		setActiveProfileId(id);
		setActiveProfileIdState(id);
		const next = getProfileSettings(profilesStore, id);
		saveReaderSettings(next);
		applyProfileSettings(next);
	};

	// Switch while the overlay is open: the draft is saved into the outgoing
	// profile and the incoming profile loads into the draft — the reader keeps
	// rendering the committed settings until the overlay closes.
	const handleOverlayProfileSwitch = (id: string) => {
		if (!draftSettings || id === activeProfileId) return;
		setActiveProfileId(id);
		setActiveProfileIdState(id);
		const committed = commitProfilesStore(
			setProfileSettings(profilesStore, activeProfileId, draftSettings),
		);
		setProfilesStore(committed);
		const next = getProfileSettings(committed, id);
		applyReaderBackground(
			getReaderTheme(next.theme, customThemesRef.current).backgroundColor,
		);
		setDraftSettings(next);
	};

	// "Save as": the new profile becomes active and takes the draft (committed
	// on overlay close); the outgoing profile keeps its pre-overlay settings.
	const handleProfileCreate = (name: string) => {
		const { store, id } = createProfile(
			profilesStore,
			name,
			draftSettings ?? settings,
		);
		setActiveProfileId(id);
		setActiveProfileIdState(id);
		setProfilesStore(commitProfilesStore(store));
	};

	const handleProfileRename = (id: string, name: string) => {
		setProfilesStore(
			commitProfilesStore(renameProfile(profilesStore, id, name)),
		);
	};

	const handleProfileDuplicate = (id: string) => {
		setProfilesStore(
			commitProfilesStore(duplicateProfile(profilesStore, id).store),
		);
	};

	const handleProfileDelete = (id: string) => {
		const next = deleteProfile(profilesStore, id);
		if (next === profilesStore) return;
		if (id !== activeProfileId) {
			setProfilesStore(commitProfilesStore(next));
			return;
		}
		const fallbackId = next.profiles[0].id;
		setActiveProfileId(fallbackId);
		setActiveProfileIdState(fallbackId);
		const committed = commitProfilesStore(next);
		setProfilesStore(committed);
		const nextSettings = getProfileSettings(committed, fallbackId);
		if (draftSettings) {
			applyReaderBackground(
				getReaderTheme(nextSettings.theme, customThemesRef.current)
					.backgroundColor,
			);
			setDraftSettings(nextSettings);
		} else {
			applyProfileSettings(nextSettings);
		}
	};

	// Tint the browser chrome with the reader theme from mount (the loading
	// screen already paints it) and restore the app chrome on exit.
	useMountEffect(() => {
		document.body.classList.add("reader-route-font");
		setThemeColor(
			getReaderTheme(settings.theme, customThemesRef.current).backgroundColor,
		);
		return () => {
			document.body.classList.remove("reader-route-font");
			resetThemeColor();
		};
	});

	// One-time reconcile with the server copy (external sync, not data
	// fetching): adopt newer server profiles/themes and restyle if the active
	// profile's settings changed under us.
	useMountEffect(() => {
		void syncReaderProfiles().then(({ profiles, themes }) => {
			if (themes) {
				customThemesRef.current = themes;
				setCustomThemes(themes);
			}
			if (profiles) {
				setProfilesStore(profiles);
				const id = getActiveProfileId(profiles);
				setActiveProfileIdState(id);
				// While the overlay is open the draft owns the screen; the draft
				// commit simply overwrites the adopted settings on close (LWW).
				if (draftSettingsRef.current === null) {
					applyProfileSettings(getProfileSettings(profiles, id));
				}
			}
		});
	});

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
		settingsOpen: settingsOpen || quickSettingsOpen,
		onBookmark: bookmarkPage,
		onCloseToc: () => setTocOpen(false),
		onCloseSettings: () => {
			setQuickSettingsOpen(false);
			closeSettings();
		},
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
			.then(() => {
				invalidateReadingProgress();
				invalidateRecommendations();
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
			<div className="flex h-dvh flex-col items-center justify-center gap-4 font-reader-sans">
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
		exploredRef.current >= 0
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
		<div
			className="font-reader-sans"
			style={{ backgroundColor: theme.backgroundColor }}
		>
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
				className="writing-horizontal-tb fixed top-0 right-0 left-0 z-10 h-[calc(2rem+var(--safe-area-top))]"
				onClick={() => setShowHeader(true)}
			/>
			{showHeader && (
				<button
					type="button"
					aria-label="Hide reader menu"
					className="fixed inset-0 z-[9]"
					onClick={() => setShowHeader(false)}
				/>
			)}
			{/* Always mounted so the bar slides in/out (activity-rail-style). */}
			<ReaderHeader
				open={showHeader}
				theme={theme}
				bookTitle={bookTitle}
				hasChapterData={sectionProgress.size > 0}
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
				onQuickSettingsClick={() => {
					setShowHeader(false);
					setQuickSettingsOpen(true);
				}}
				onExitClick={() =>
					navigate({ to: "/dashboard/books/$uuid", params: { uuid } })
				}
			/>

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

			{quickSettingsOpen && (
				<ReaderQuickSettings
					settings={settings}
					theme={theme}
					profiles={profilesStore.profiles}
					activeProfileId={activeProfileId}
					onProfileSwitch={handleProfileSwitch}
					onChange={handleQuickSettingsChange}
					onOpenSettings={() => {
						setQuickSettingsOpen(false);
						openSettings();
					}}
					onClose={() => setQuickSettingsOpen(false)}
				/>
			)}

			{draftSettings && (
				<ReaderSettingsOverlay
					settings={draftSettings}
					customThemes={customThemes}
					currentBookUuid={uuid}
					profiles={profilesStore.profiles}
					activeProfileId={activeProfileId}
					onProfileSwitch={handleOverlayProfileSwitch}
					onProfileCreate={handleProfileCreate}
					onProfileRename={handleProfileRename}
					onProfileDuplicate={handleProfileDuplicate}
					onProfileDelete={handleProfileDelete}
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
