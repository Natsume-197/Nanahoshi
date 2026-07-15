import type {
	ReaderSettings as EngineSettings,
	HighlightSpan,
	ReaderPosition,
	ReaderStore,
} from "@lostcoords/lumi-reader-core";
import { createReaderStore } from "@lostcoords/lumi-reader-core";
import { Reader, useReaderStore } from "@lostcoords/lumi-reader-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { ReaderToc } from "@/components/reader/reader-toc";
import { useReaderSync } from "@/components/reader/use-reader-sync";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { usePresenceEvents } from "@/hooks/use-presence-events";
import { getBookmark, setBookmark } from "@/lib/lumi/bookmark-store";
import { pageDeltaForSwipe, pageDeltaForWheel } from "@/lib/lumi/navigation";
import { createSettingsPort, createStoragePort } from "@/lib/lumi/ports";
import {
	loadLumiSettings,
	type ReaderSettings,
	saveLumiSettings,
	themeVars,
	toEngineFlow,
	toEngineSettings,
} from "@/lib/lumi/settings";
import { buildTocSections, positionForTocReference } from "@/lib/lumi/toc";
import {
	type CustomReaderThemes,
	getReaderTheme,
	loadCustomThemes,
	saveCustomThemes,
} from "@/lib/reader/settings";
import { resetThemeColor, setThemeColor } from "@/lib/theme-color";
import { LumiFooter } from "./lumi-footer";
import { LumiHeader } from "./lumi-header";
import { LumiLoading } from "./lumi-loading";
import { LumiQuickSettings } from "./lumi-quick-settings";
import { LumiSettingsPanel } from "./lumi-settings-panel";
import { useLumiKeybinds } from "./use-lumi-keybinds";

const WHEEL_THROTTLE_MS = 120;
const SWIPE_THRESHOLD_PX = 40;

/** Build the engine highlight span that paints the manual bookmark as an in-page marker. */
function bookmarkHighlights(bookmark: ReaderPosition | null): HighlightSpan[] {
	return bookmark
		? [
				{
					id: "bookmark",
					kind: "page",
					start: bookmark.locator,
					end: bookmark.locator,
				},
			]
		: [];
}

/** The lumi-engine reader, an alternative to the ttu reader; mounted with key={uuid} per book. */
export function LumiReader(props: { uuid: string }) {
	const [settings, setSettings] = useState<ReaderSettings>(() =>
		loadLumiSettings(),
	);
	const [customThemes, setCustomThemes] = useState<CustomReaderThemes>(() =>
		loadCustomThemes(),
	);
	const [progress, setProgress] = useState<number | undefined>(0);
	const [menuOpen, setMenuOpen] = useState(false);
	const [tocOpen, setTocOpen] = useState(false);
	const [quickOpen, setQuickOpen] = useState(false);
	const [draftSettings, setDraftSettings] = useState<ReaderSettings | null>(
		null,
	);
	const settingsOpen = draftSettings !== null;
	const [bookmark, setBookmarkState] = useState<ReaderPosition | null>(() =>
		getBookmark(props.uuid),
	);
	const [hydrated, setHydrated] = useState(false);

	usePresenceEvents();

	const progressRef = useRef(setProgress);
	progressRef.current = setProgress;

	const engineSettings = useMemo<EngineSettings>(
		() => toEngineSettings(settings),
		[settings],
	);
	const engineRef = useRef(engineSettings);
	engineRef.current = engineSettings;
	const maxCachedRef = useRef(settings.maxCachedBooks);
	maxCachedRef.current = settings.maxCachedBooks;

	const settingsPort = useMemo(
		() => createSettingsPort(() => engineRef.current),
		[],
	);
	const theme = getReaderTheme(settings.theme, customThemes);

	const store = useMemo<ReaderStore>(
		() =>
			createReaderStore({
				ports: {
					storage: createStoragePort(
						(p) => progressRef.current(p),
						() => maxCachedRef.current,
					),
				},
				initialFlow: toEngineFlow(loadLumiSettings().viewMode),
			}),
		[],
	);

	useMountEffect(() => {
		void store.loadBook(props.uuid).then(() => {
			store.setHighlights(bookmarkHighlights(getBookmark(props.uuid)));
		});
	});

	useMountEffect(() => {
		const flushPosition = () => {
			void store.flushPosition();
		};
		const flushWhenHidden = () => {
			if (document.visibilityState === "hidden") flushPosition();
		};

		window.addEventListener("pagehide", flushPosition);
		document.addEventListener("visibilitychange", flushWhenHidden);
		return () => {
			window.removeEventListener("pagehide", flushPosition);
			document.removeEventListener("visibilitychange", flushWhenHidden);
			flushPosition();
		};
	});

	const applyReaderBackground = useCallback((color: string) => {
		document.body.style.setProperty("background-color", color);
		setThemeColor(color);
	}, []);

	useMountEffect(() => {
		setHydrated(true);
		applyReaderBackground(theme.backgroundColor);
		return () => {
			document.body.style.removeProperty("background-color");
			resetThemeColor();
		};
	});

	const status = useReaderStore(store, (s) => s.status);
	const error = useReaderStore(store, (s) => s.error);
	const book = useReaderStore(store, (s) => s.book);
	const flow = useReaderStore(store, (s) => s.flow);
	const readingPoint = useReaderStore(store, (s) => s.readingPoint);

	const paginated = flow === "paginated";
	const vertical = settings.writingMode === "vertical-rl";
	const overlayOpen = tocOpen || settingsOpen || quickOpen;

	const hasBookmark = bookmark !== null;
	const atBookmark =
		bookmark !== null &&
		readingPoint !== null &&
		readingPoint.progress.globalAtomOffset ===
			bookmark.progress.globalAtomOffset;

	const update = useCallback(
		(patch: Partial<ReaderSettings>) => {
			setSettings((prev) => {
				const next = { ...prev, ...patch };
				saveLumiSettings(next);
				return next;
			});
			if (patch.viewMode !== undefined)
				store.setFlowMode(toEngineFlow(patch.viewMode));
			if (patch.theme)
				applyReaderBackground(
					getReaderTheme(patch.theme, customThemes).backgroundColor,
				);
		},
		[store, customThemes, applyReaderBackground],
	);

	const updateDraft = useCallback((patch: Partial<ReaderSettings>) => {
		setDraftSettings((prev) => (prev ? { ...prev, ...patch } : prev));
	}, []);

	const updateCustomThemes = useCallback((next: CustomReaderThemes) => {
		setCustomThemes(next);
		saveCustomThemes(next);
	}, []);

	const openSettings = () => setDraftSettings(settings);

	const closeSettings = () => {
		const next = draftSettings;
		setDraftSettings(null);
		if (!next) return;
		setSettings(next);
		saveLumiSettings(next);
		applyReaderBackground(
			getReaderTheme(next.theme, customThemes).backgroundColor,
		);
		if (next.viewMode !== settings.viewMode)
			store.setFlowMode(toEngineFlow(next.viewMode));
	};

	const setBookmarkHere = useCallback(() => {
		const point = store.getState().readingPoint;
		if (!point) return;
		setBookmark(props.uuid, point);
		setBookmarkState(point);
		store.setHighlights(bookmarkHighlights(point));
	}, [store, props.uuid]);

	const returnToBookmark = useCallback(() => {
		if (bookmark) store.jumpToPosition(bookmark);
	}, [store, bookmark]);

	useLumiKeybinds({
		store,
		vertical,
		paginated,
		overlayOpen,
		onToggleMenu: () => setMenuOpen((v) => !v),
		onEscape: () => {
			setTocOpen(false);
			setQuickOpen(false);
			closeSettings();
		},
		onSetBookmark: setBookmarkHere,
		onReturnBookmark: returnToBookmark,
	});

	const wheelAt = useRef(0);
	const touchStart = useRef<{ x: number; y: number } | null>(null);

	const onWheel = useCallback(
		(event: React.WheelEvent) => {
			if (!paginated || settings.disableWheelNavigation) return;
			const now = event.timeStamp;
			if (now - wheelAt.current < WHEEL_THROTTLE_MS) return;
			wheelAt.current = now;
			const delta = pageDeltaForWheel(event.deltaX, event.deltaY, vertical);
			if (delta > 0) store.nextPage();
			else if (delta < 0) store.prevPage();
		},
		[paginated, settings.disableWheelNavigation, store, vertical],
	);

	const onTouchStart = useCallback((event: React.TouchEvent) => {
		const t = event.changedTouches[0];
		touchStart.current = { x: t.clientX, y: t.clientY };
	}, []);

	const onTouchEnd = useCallback(
		(event: React.TouchEvent) => {
			if (!paginated) return;
			const start = touchStart.current;
			touchStart.current = null;
			if (!start) return;
			const t = event.changedTouches[0];
			const dx = t.clientX - start.x;
			const dy = t.clientY - start.y;
			const delta = pageDeltaForSwipe(dx, dy, vertical, SWIPE_THRESHOLD_PX);
			if (delta > 0) store.nextPage();
			else if (delta < 0) store.prevPage();
		},
		[paginated, vertical, store],
	);

	const toggleFullscreen = useCallback(() => {
		if (document.fullscreenElement) void document.exitFullscreen();
		else void document.documentElement.requestFullscreen().catch(() => {});
	}, []);

	const bookTitle = book?.epub.meta.title ?? "";
	const explored = readingPoint?.progress.globalAtomOffset ?? 0;
	const total = readingPoint?.progress.totalAtoms ?? book?.totalAtoms ?? 0;
	const fraction = readingPoint?.progress.fraction ?? 0;

	const sectionProgress = useMemo(
		() => buildTocSections(book, explored),
		[book, explored],
	);

	const getCharCounts = useCallback(() => {
		const rp = store.getState().readingPoint;
		return {
			exploredCharCount: Math.round(rp?.progress.globalAtomOffset ?? 0),
			bookCharCount: Math.max(
				rp?.progress.totalAtoms ?? store.getState().book?.totalAtoms ?? 0,
				1,
			),
		};
	}, [store]);

	useReaderSync({
		bookUuid: props.uuid,
		enabled: status === "ready" && total > 0,
		getCharCounts,
	});

	if (!hydrated) {
		return (
			<div className="fixed inset-0 flex items-center justify-center bg-background">
				<div className="size-12 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
			</div>
		);
	}

	return (
		<div
			className="fixed inset-0"
			style={themeVars(theme)}
			onWheel={onWheel}
			onTouchStart={onTouchStart}
			onTouchEnd={onTouchEnd}
		>
			{status === "error" && (
				<div className="p-8 text-sm">Failed to load book: {error}</div>
			)}
			{status !== "ready" && status !== "error" && (
				<LumiLoading theme={theme} progress={progress} />
			)}

			<Reader
				key={props.uuid}
				store={store}
				settings={settingsPort}
				settingsVersion={settings}
			/>

			{!menuOpen && (
				<button
					type="button"
					aria-label="Show reader menu"
					onClick={() => setMenuOpen(true)}
					className="fixed inset-x-0 top-0 z-30 h-8"
				/>
			)}
			{menuOpen && (
				<button
					type="button"
					aria-label="Hide reader menu"
					onClick={() => setMenuOpen(false)}
					className="fixed inset-0 z-30"
				/>
			)}

			<LumiHeader
				open={menuOpen}
				theme={theme}
				bookTitle={bookTitle}
				hasChapterData={sectionProgress.size > 0}
				hasBookmark={hasBookmark}
				atBookmark={atBookmark}
				onTocClick={() => {
					setMenuOpen(false);
					setTocOpen(true);
				}}
				onSetBookmark={setBookmarkHere}
				onReturnBookmark={returnToBookmark}
				onSettingsClick={() => {
					setMenuOpen(false);
					setQuickOpen(true);
				}}
				onToggleFullscreen={toggleFullscreen}
				onExit={() => window.history.back()}
			/>

			{quickOpen && (
				<LumiQuickSettings
					settings={settings}
					theme={theme}
					onChange={update}
					onOpenSettings={() => {
						setQuickOpen(false);
						openSettings();
					}}
					onClose={() => setQuickOpen(false)}
				/>
			)}

			<LumiFooter
				theme={theme}
				explored={explored}
				total={total}
				fraction={fraction}
				showCharacterCounter={settings.showCharacterCounter}
				showPercentage={settings.showPercentage}
			/>

			{tocOpen && (
				<ReaderToc
					theme={theme}
					sectionProgress={sectionProgress}
					exploredCharCount={explored}
					verticalMode={vertical}
					onNavigate={(reference) => {
						if (!book) return;
						const position = positionForTocReference(book, reference);
						if (position) store.jumpToPosition(position);
					}}
					onClose={() => setTocOpen(false)}
				/>
			)}

			<LumiSettingsPanel
				open={settingsOpen}
				settings={draftSettings ?? settings}
				customThemes={customThemes}
				onChange={updateDraft}
				onCustomThemesChange={updateCustomThemes}
				onClose={closeSettings}
			/>
		</div>
	);
}
