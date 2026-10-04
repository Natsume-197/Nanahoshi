import { ebookSourceFormatForFilename } from "@nanahoshi/api/modules/scanning/supportedExtensions";
import { useIsMobile } from "@nanahoshi/ui/hooks/use-mobile";
import { useMountEffect } from "@nanahoshi/ui/hooks/use-mount-effect";
import { useWindowEvent } from "@nanahoshi/ui/hooks/use-window-event";
import {
	type CSSProperties,
	type RefObject,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPdfSections } from "./document/pdf-source";
import type { ReaderPosition, SectionWithProgress } from "./document/types";
import { readerApi, readerHost } from "./host/reader-host";
import { m } from "./i18n/paraglide/messages";
import { useBookLoader } from "./interaction/use-book-loader";
import { useReaderKeybinds } from "./interaction/use-reader-keybinds";
import { useReaderSync } from "./interaction/use-reader-sync";
import { usePresenceIdle } from "./presence/use-presence-idle";
import {
	commitCustomThemes,
	commitProfilesStore,
	createProfile,
	deleteProfile,
	duplicateProfile,
	getActiveProfileId,
	getProfileSettings,
	hasPendingReaderProfileConflict,
	loadProfilesStore,
	READER_PROFILES_RECONCILED_EVENT,
	type ReaderProfilesStore,
	renameProfile,
	replaceProfileThemeReferences,
	resolveReaderProfileConflict,
	setActiveProfileId,
	setProfileSettings,
	syncReaderProfiles,
} from "./presentation/profiles";
import {
	loadReaderPresentationPreference,
	type ReaderPresentation,
	type ReaderPresentationChange,
	type ReaderPresentationPreference,
	resolveReaderPresentation,
	saveReaderPresentationPreference,
	updateReaderPresentationPreference,
} from "./presentation/reader-presentation";
import { prepareReaderStorage } from "./presentation/reader-storage";
import {
	type CustomReaderThemes,
	getReaderScrollbarColor,
	getReaderScrollbarTrackColor,
	getReaderTheme,
	loadCustomThemes,
	READER_THEME_PREVIEW_ID,
	type ReaderSettings,
	type ReaderThemeColors,
	readerThemes,
} from "./presentation/settings";
import type { VisualReaderSettings } from "./presentation/visual-settings";
import { type BookReaderApi, supportsReaderScrollbar } from "./reader-contract";
import type { ReaderRuntime, ReadListenExtension } from "./reader-extensions";
import { ReaderEngine } from "./renderers/reader-engine";
import { getReaderScrollbarWidth } from "./renderers/shared/reader-document-chrome";
import { viewportHeight, viewportWidth } from "./renderers/shared/viewport";
import { resolveVisualReadingDirection } from "./renderers/visual/book-reader-visual";
import { resolveReadingPosition } from "./session/reader-position";
import { useReaderSession } from "./session/reader-session";
import { ReadingSessionControl } from "./sessions/reading-session-control";
import { readerChapters } from "./tracking/chapters";
import {
	type ReadingTracker,
	useReadingTracker,
} from "./tracking/use-reading-tracker";
import { ReaderFooter } from "./ui/chrome/reader-footer";
import { ReaderHeader } from "./ui/chrome/reader-header";
import { ReaderImageGallery } from "./ui/chrome/reader-image-gallery";
import { ReaderLoadingScreen } from "./ui/chrome/reader-loading-screen";
import { ReaderReadingPoint } from "./ui/chrome/reader-reading-point";
import { ReaderToc } from "./ui/chrome/reader-toc";
import { readerSurface } from "./ui/controls/reader-controls";
import { ReaderQuickSettings } from "./ui/settings/reader-quick-settings";
import "./ui/styles/reader.css";
// Bundled CJK fonts: vertical-rl text renders garbled glyph overlaps when the
// requested family is missing and the system serif lacks vertical metrics.
import "@fontsource/noto-serif-jp/japanese-400.css";
import "@fontsource/noto-serif-jp/japanese-700.css";
import "@fontsource/noto-sans-jp/japanese-400.css";
import "@fontsource/noto-sans-jp/japanese-700.css";

export interface ReaderScreenBook {
	title?: string | null;
	filename?: string | null;
	cover?: string | null;
	filesizeKb?: number | null;
	filehash?: string | null;
	pageCount?: number | null;
	languageCode?: string | null;
	contentForm?: "text" | "images" | null;
}

export interface ReaderScreenProps {
	book: ReaderScreenBook | null | undefined;
	uuid: string;
	userId: string;
	/** Server that authorizes this reading session; null while still resolving. */
	serverId: string | null;
	onExit: () => void;
	/** After the book is marked completed on the server. */
	onBookCompleted: () => void | Promise<void>;
	/** Leave room for the host's audio player bar. */
	reservePlayerSpace?: boolean;
	/** The host's audio player covers the reader; block reading input. */
	playerExpanded?: boolean;
	readListen?: ReadListenExtension;
}

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
	"horizontalPaddingPct",
	"verticalPaddingPct",
	"hideFurigana",
	"furiganaStyle",
	"avoidPageBreak",
	"pageColumns",
]);

function FocusReaderScrollContainer({
	containerRef,
}: {
	containerRef: RefObject<HTMLElement | null>;
}) {
	useMountEffect(() => {
		containerRef.current?.focus({ preventScroll: true });
	});
	return null;
}

export function ReaderScreen({
	book,
	uuid,
	userId,
	serverId: bookServerId,
	onExit,
	onBookCompleted,
	reservePlayerSpace = false,
	playerExpanded: isAudioPlayerExpanded = false,
	readListen,
}: ReaderScreenProps) {
	const bookSourceFormat = book?.filename
		? (ebookSourceFormatForFilename(book.filename) ?? undefined)
		: undefined;
	const isPdfBook = bookSourceFormat === "pdf";
	const readListenActive = readListen?.active ?? false;
	const isMobile = useIsMobile();
	// Reading without touching the page for a while shows the member as away.
	usePresenceIdle();

	const [profilesStore, setProfilesStore] = useState<ReaderProfilesStore>(
		() => {
			prepareReaderStorage(userId);
			return loadProfilesStore();
		},
	);
	const [profilesConflict, setProfilesConflict] = useState(
		hasPendingReaderProfileConflict,
	);
	const [activeProfileId, setActiveProfileIdState] = useState<string>(() =>
		getActiveProfileId(profilesStore),
	);
	const [settings, setSettings] = useState<ReaderSettings>(() =>
		getProfileSettings(profilesStore, activeProfileId),
	);
	const [presentationPreference, setPresentationPreference] =
		useState<ReaderPresentationPreference>(() =>
			loadReaderPresentationPreference(uuid),
		);
	const [customThemes, setCustomThemes] =
		useState<CustomReaderThemes>(loadCustomThemes);
	// SSR renders only the loading screen, which never reads the viewport.
	const [readerViewport, setReaderViewport] = useState(() =>
		typeof window === "undefined"
			? { width: 0, height: 0 }
			: { width: viewportWidth(), height: viewportHeight() },
	);
	useWindowEvent("resize", () => {
		setReaderViewport({ width: viewportWidth(), height: viewportHeight() });
	});
	// Ref so the custom-theme preview resolves themes saved in the same tick
	// (the dialog commits the theme colors and selects the theme back to back).
	const customThemesRef = useRef(customThemes);
	const [showHeader, setShowHeader] = useState(false);
	const [tocOpen, setTocOpen] = useState(false);
	const [galleryOpen, setGalleryOpen] = useState(false);
	const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
	const [sectionProgress, setSectionProgress] = useState<
		Map<string, SectionWithProgress>
	>(new Map());
	const [pdfDocumentPageCount, setPdfDocumentPageCount] = useState<
		number | null
	>(null);
	const [readerApiRevision, setReaderApiRevision] = useState(0);
	const apiRef = useRef<BookReaderApi | null>(null);
	const readerSurfaceRef = useRef<HTMLElement | null>(null);
	const overlayEntryPositionRef = useRef<ReaderPosition | undefined>(undefined);
	const readerSession = useReaderSession(uuid);
	const {
		bookCharCountRef,
		capturePosition,
		exploredCharCount,
		exploredRef,
		hydrate,
		positionClockRef,
		readerSessionRef,
		reportPosition,
		setBookCharCount,
		setExploredCharCount,
	} = readerSession;
	// Read by the async profile-sync callback, which outlives a render.
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	const previousUuidRef = useRef(uuid);
	if (uuid !== previousUuidRef.current) {
		previousUuidRef.current = uuid;
		setPresentationPreference(loadReaderPresentationPreference(uuid));
		setPdfDocumentPageCount(null);
		overlayEntryPositionRef.current = undefined;
	}
	const runtime: ReaderRuntime = {
		apiRef,
		surfaceRef: readerSurfaceRef,
		exploredRef,
		bookCharCountRef,
	};

	const bookTitle = book?.title ?? book?.filename ?? "Book";
	// A rendered EPUB's dimensions depend on its own CSS, fonts and late image
	// loads. Until a virtual reader can preserve that geometry exactly, use one
	// complete document so continuous and paginated share the proven position
	// calculator and never move the reading edge underneath the user.
	const allowLazySections = false;

	const loadState = useBookLoader({
		uuid,
		bookTitle,
		cover: book?.cover ?? null,
		serverId: bookServerId,
		fileSizeBytes: book?.filesizeKb ? book.filesizeKb * 1024 : undefined,
		fileHash: book?.filehash,
		fileName: book?.filename ?? undefined,
		pageCount: book?.pageCount,
		sourceFormat: bookSourceFormat,
		language: book?.languageCode ?? undefined,
		contentForm: book?.contentForm,
		allowLazySections,
		readerSettings: settings,
		onLoaded: ({ data, position, positionClockAt }) => {
			hydrate({
				characters: data.characters,
				position,
				positionClockAt,
			});
		},
	});

	const handlePdfDocumentReady = useCallback(
		(pageCount: number) => {
			setBookCharCount(pageCount);
			setPdfDocumentPageCount((current) =>
				current === pageCount ? current : pageCount,
			);
		},
		[setBookCharCount],
	);

	const getCharCounts = useCallback(() => {
		const position = readerSession.getResumePosition(
			capturePosition(() => apiRef.current?.getPosition()),
		);
		return {
			exploredCharCount: position?.exploredCharCount,
			bookCharCount: bookCharCountRef.current,
			positionIntentAt: position?.modifiedAt,
		};
	}, [
		readerSession.getResumePosition,
		capturePosition,
		bookCharCountRef.current,
	]);

	// Session activity follows the visible position even when the member keeps
	// a manual bookmark as their separate resume position.
	const getTrackingPosition = () =>
		apiRef.current?.getPosition() ??
		readerSessionRef.current?.snapshot().position;
	const readingTracker = useReadingTracker({
		getLocator: () => JSON.stringify(getTrackingPosition()) ?? null,
		getChapters: () =>
			isPdfBook
				? null
				: readerChapters(
						[...sectionProgress.values()],
						bookCharCountRef.current,
					),
		userId,
		bookUuid: uuid,
		contentVersion: book?.filehash ?? uuid,
		bookCharCount: isPdfBook ? undefined : bookCharCountRef.current,
		enabled:
			!tocOpen &&
			!galleryOpen &&
			!quickSettingsOpen &&
			loadState.phase === "ready" &&
			(!isPdfBook || pdfDocumentPageCount !== null),
		getPosition: () => {
			const position = getTrackingPosition();
			const total = bookCharCountRef.current;
			return position !== undefined && total > 0
				? Math.max(0, Math.min(1, position.exploredCharCount / total))
				: null;
		},
	});
	const { syncNow, binding: readerSync } = useReaderSync({
		bookUuid: uuid,
		trackTime: false,
		enabled:
			loadState.phase === "ready" &&
			(!isPdfBook || pdfDocumentPageCount !== null) &&
			bookCharCountRef.current > 0,
		getCharCounts,
		onRemoteProgress: (progress) => {
			if (!apiRef.current) return;
			const position = resolveReadingPosition(
				undefined,
				{
					exploredCharCount: progress.exploredCharCount ?? 0,
					bookCharCount: progress.bookCharCount ?? 0,
					modifiedAt:
						progress.positionIntentAt ??
						(progress.positionUpdatedAt
							? new Date(progress.positionUpdatedAt).getTime()
							: 0),
				},
				bookCharCountRef.current,
			);
			if (position && readerSession.applyRemotePosition(position)) {
				readingTracker.markJump();
				apiRef.current.scrollToPosition(position);
			}
		},
	});

	const handlePositionChange = (nextPosition: ReaderPosition) => {
		const position = reportPosition(nextPosition);
		if (!position) return;
		if (bookCharCountRef.current > 0)
			readingTracker.reportPosition(
				position.exploredCharCount / bookCharCountRef.current,
			);
		// Quick Settings is deliberately non-modal so the navbar remains usable.
		// If the reader is also moved behind the sheet, that genuine reading input
		// becomes the new reflow anchor instead of snapping to the opening point.
		if (quickSettingsOpen) overlayEntryPositionRef.current = position;
	};

	const captureReaderPosition = () => {
		return capturePosition(() => apiRef.current?.getPosition());
	};

	const saveReadingPoint = (selected?: ReaderPosition) => {
		const position =
			selected ?? apiRef.current?.getPosition({ manualBookmark: true });
		if (!position) return;
		if (!readerSession.saveManualPosition(position))
			readerHost().notifyError(m.reader_point_error());
		else void syncNow();
	};
	const goToReadingPoint = () => {
		readingTracker.markJump();
		const position = readerSession.manualPoint.position;
		if (!position || !apiRef.current) return;
		apiRef.current.scrollToPosition(position);
		handlePositionChange(position);
	};
	const changeManualSaving = (manual: boolean) => {
		const position =
			apiRef.current?.getPosition() ?? overlayEntryPositionRef.current;
		if (!position) return;
		if (!readerSession.setManualSaving(manual, position))
			readerHost().notifyError(m.reader_point_error());
		else void syncNow();
	};

	// Direct commit path used by settings controls that do not touch the book layout.
	const handleSettingsChange = (patch: Partial<ReaderSettings>) => {
		// Native clicks/key repeats can arrive before React publishes the previous
		// render. Read both sources of truth directly so a burst always builds on
		// the latest committed value instead of a stale render closure.
		const next = { ...settingsRef.current, ...patch };
		const currentProfiles = loadProfilesStore();
		const currentProfileId = getActiveProfileId(currentProfiles);
		settingsRef.current = next;
		setSettings(next);
		setProfilesStore(
			commitProfilesStore(
				setProfileSettings(currentProfiles, currentProfileId, next),
			),
		);
	};

	const setLiveTheme = (themeId: string, themes = customThemesRef.current) => {
		const nextSettings = { ...settingsRef.current, theme: themeId };
		settingsRef.current = nextSettings;
		setSettings(nextSettings);
		applyReaderBackground(getReaderTheme(themeId, themes).backgroundColor);
	};

	const handleCustomThemePreview = (colors: ReaderThemeColors) => {
		const next = {
			...customThemesRef.current,
			[READER_THEME_PREVIEW_ID]: colors,
		};
		customThemesRef.current = next;
		setCustomThemes(next);
		setLiveTheme(READER_THEME_PREVIEW_ID, next);
	};

	const handleCustomThemePreviewCancel = (previousTheme: string) => {
		const next = { ...customThemesRef.current };
		delete next[READER_THEME_PREVIEW_ID];
		customThemesRef.current = next;
		setCustomThemes(next);
		setLiveTheme(previousTheme, next);
	};

	const handleCustomThemeSave = (
		name: string,
		colors: ReaderThemeColors,
		previousName: string,
	) => {
		const nextThemes = { ...customThemesRef.current };
		delete nextThemes[READER_THEME_PREVIEW_ID];
		if (previousName && previousName !== name) delete nextThemes[previousName];
		nextThemes[name] = colors;
		customThemesRef.current = nextThemes;
		setCustomThemes(nextThemes);
		commitCustomThemes(nextThemes);

		const referenced = replaceProfileThemeReferences(
			profilesStore,
			previousName,
			name,
		);
		const nextProfiles = setProfileSettings(referenced, activeProfileId, {
			...settingsRef.current,
			theme: name,
		});
		setProfilesStore(commitProfilesStore(nextProfiles));
		setLiveTheme(name, nextThemes);
	};

	const handleCustomThemeDelete = (name: string) => {
		const fallbackTheme = readerThemes[0]?.id ?? "light-theme";
		const nextThemes = { ...customThemesRef.current };
		delete nextThemes[name];
		customThemesRef.current = nextThemes;
		setCustomThemes(nextThemes);
		commitCustomThemes(nextThemes);

		const nextProfiles = replaceProfileThemeReferences(
			profilesStore,
			name,
			fallbackTheme,
		);
		setProfilesStore(commitProfilesStore(nextProfiles));
		if (settingsRef.current.theme === name) {
			setLiveTheme(fallbackTheme, nextThemes);
		}
	};

	// Quick settings commit immediately (the book is visible behind the popover
	// and must react in real time). Structural keys remount via readerKey; the
	// rest re-measure in place — relayout() itself coalesces the slider-drag
	// bursts and waits out the React commit.
	const handleQuickSettingsChange = (patch: Partial<ReaderSettings>) => {
		const layoutChanged = Object.keys(patch).some((key) =>
			LAYOUT_SETTING_KEYS.has(key),
		);
		const position = layoutChanged
			? (overlayEntryPositionRef.current ?? captureReaderPosition())
			: undefined;
		handleSettingsChange(patch);
		if (patch.theme) {
			applyReaderBackground(
				getReaderTheme(patch.theme, customThemesRef.current).backgroundColor,
			);
		}
		if (layoutChanged && patch.writingMode === undefined) {
			apiRef.current?.relayout(position);
		}
	};

	const handleVisualSettingsChange = (patch: Partial<VisualReaderSettings>) => {
		handleQuickSettingsChange({
			...(patch.layout !== undefined && { visualLayout: patch.layout }),
			...(patch.readingDirection !== undefined && {
				visualReadingDirection: patch.readingDirection,
			}),
			...(patch.progressStyle !== undefined && {
				visualProgressStyle: patch.progressStyle,
			}),
		});
	};

	const handlePresentationChange = (change: ReaderPresentationChange) => {
		// Capture a mode-neutral position before the active engine unmounts. Every
		// engine maps exploredCharCount onto the same normalized section sequence.
		const currentPosition =
			captureReaderPosition() ?? overlayEntryPositionRef.current;
		if (currentPosition) {
			exploredRef.current = currentPosition.exploredCharCount;
			setExploredCharCount(currentPosition.exploredCharCount);
		}
		if (change.type === "text-layout") {
			// Reading flow is a reader-profile preference, shared by every book.
			handleSettingsChange({ textLayout: change.value });
			return;
		}
		const preference = updateReaderPresentationPreference(change);
		setPresentationPreference(preference);
		saveReaderPresentationPreference(uuid, preference);
	};

	// Body background and the browser-chrome tint (theme-color meta) always
	// move together while reading.
	const applyReaderBackground = (color: string) => {
		document.body.style.setProperty("background-color", color);
		readerHost().setChromeColor(color);
	};

	// Fullscreen overlays conceal the native scrollbar without removing its
	// gutter. Changing scrollbar-width would resize the reading area and reflow
	// the book underneath the overlay.
	const hideDocumentScrollbar = () => {
		// Apply this synchronously so native scrollbar paint cannot flash over the
		// opaque overlay while Base UI mounts its modal surface.
		document.documentElement.style.removeProperty("scrollbar-color");
		document.documentElement.classList.add("reader-scrollbar-concealed");
		const readerApi = apiRef.current;
		if (supportsReaderScrollbar(readerApi)) {
			readerApi.setScrollbarHidden(true);
		}
	};

	const restoreDocumentScrollbar = (themeId: string) => {
		const readerTheme = getReaderTheme(themeId, customThemesRef.current);
		document.documentElement.classList.remove("reader-scrollbar-concealed");
		document.documentElement.style.setProperty(
			"scrollbar-color",
			`${getReaderScrollbarColor(readerTheme)} ${getReaderScrollbarTrackColor(readerTheme)}`,
		);
		document.documentElement.style.setProperty(
			"scrollbar-width",
			getReaderScrollbarWidth(),
		);
		const readerApi = apiRef.current;
		if (supportsReaderScrollbar(readerApi)) {
			readerApi.setScrollbarHidden(false);
		}
	};

	const closeQuickSettings = () => {
		setQuickSettingsOpen(false);
		restoreDocumentScrollbar(settings.theme);
		overlayEntryPositionRef.current = undefined;
	};

	const applyCommittedSettings = (
		next: ReaderSettings,
		prev: ReaderSettings,
		position?: ReaderPosition,
	) => {
		const structuralChanged =
			next.textLayout !== prev.textLayout ||
			next.writingMode !== prev.writingMode;
		const layoutChanged = [...LAYOUT_SETTING_KEYS].some(
			(key) =>
				next[key as keyof ReaderSettings] !== prev[key as keyof ReaderSettings],
		);

		// Structural changes remount (the remount measures from scratch); other
		// layout changes re-measure in place (relayout waits out the commit).
		if (!structuralChanged && layoutChanged) {
			apiRef.current?.relayout(position);
		}
	};

	// Swaps the live settings for another profile: restyles the page chrome and
	// remounts/relayouts the book like a settings commit.
	const applyProfileSettings = (next: ReaderSettings) => {
		const prev = settingsRef.current;
		const position = captureReaderPosition();
		settingsRef.current = next;
		setSettings(next);
		const nextTheme = getReaderTheme(next.theme, customThemesRef.current);
		applyReaderBackground(nextTheme.backgroundColor);
		document.documentElement.style.setProperty(
			"scrollbar-color",
			`${getReaderScrollbarColor(nextTheme)} ${getReaderScrollbarTrackColor(nextTheme)}`,
		);
		applyCommittedSettings(next, prev, position);
	};

	const handleQuickProfileSwitch = (id: string) => {
		if (id === activeProfileId) return;
		setActiveProfileId(id);
		setActiveProfileIdState(id);
		applyProfileSettings(getProfileSettings(profilesStore, id));
	};

	// "Save as": the new profile becomes active and copies the current settings.
	const handleProfileCreate = (name: string) => {
		const { store, id } = createProfile(profilesStore, name, settings);
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
		const duplicate = duplicateProfile(profilesStore, id, (name) =>
			m["reader_settings.profile_copy_name"]({ name }),
		);
		setActiveProfileId(duplicate.id);
		setActiveProfileIdState(duplicate.id);
		setProfilesStore(commitProfilesStore(duplicate.store));
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
		applyProfileSettings(nextSettings);
	};

	// Tint the browser chrome with the reader theme from mount (the loading
	// screen already paints it) and restore the app chrome on exit.
	useMountEffect(() => {
		document.body.classList.add("reader-route-font");
		readerHost().setChromeColor(
			getReaderTheme(settings.theme, customThemesRef.current).backgroundColor,
		);
		return () => {
			document.body.classList.remove("reader-route-font");
			readerHost().setChromeColor(null);
		};
	});

	// One-time reconcile with the server copy (external sync, not data
	// fetching): adopt newer server profiles/themes and restyle if the active
	// profile's settings changed under us.
	useMountEffect(() => {
		const handleReconciled = (event: Event) => {
			setProfilesConflict(hasPendingReaderProfileConflict());
			const detail = (
				event as CustomEvent<{
					profiles?: ReaderProfilesStore;
					themes?: CustomReaderThemes;
				}>
			).detail;
			if (detail.themes) {
				customThemesRef.current = detail.themes;
				setCustomThemes(detail.themes);
			}
			if (detail.profiles) {
				setProfilesStore(detail.profiles);
				const id = getActiveProfileId(detail.profiles);
				setActiveProfileIdState(id);
				applyProfileSettings(getProfileSettings(detail.profiles, id));
			}
		};
		window.addEventListener(READER_PROFILES_RECONCILED_EVENT, handleReconciled);
		return () =>
			window.removeEventListener(
				READER_PROFILES_RECONCILED_EVENT,
				handleReconciled,
			);
	});

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
				applyProfileSettings(getProfileSettings(profiles, id));
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
			if (target) {
				readingTracker.markJump();
				apiRef.current?.navigateToSection(target.reference);
			}
		},
		[sectionProgress, readingTracker.markJump],
	);

	const verticalMode = settings.writingMode === "vertical-rl";
	const visualSettings: VisualReaderSettings = {
		layout: settings.visualLayout,
		readingDirection: settings.visualReadingDirection,
		progressStyle: settings.visualProgressStyle,
	};
	const firstDimensionMargin = Math.round(
		((verticalMode
			? settings.horizontalPaddingPct
			: settings.verticalPaddingPct) /
			100) *
			(verticalMode ? readerViewport.width : readerViewport.height),
	);
	const secondDimensionPadding = verticalMode
		? settings.verticalPaddingPct
		: settings.horizontalPaddingPct;
	const secondDimensionAxis = verticalMode
		? readerViewport.height
		: readerViewport.width;
	const secondDimensionMaxValue =
		secondDimensionPadding === 0
			? 0
			: Math.round(
					(1 - (secondDimensionPadding * 2) / 100) * secondDimensionAxis,
				);
	const effectiveReaderSettings: ReaderSettings = {
		...settings,
		firstDimensionMargin,
		secondDimensionMaxValue,
	};
	const theme = getReaderTheme(settings.theme, customThemes);
	const presentation: ReaderPresentation = resolveReaderPresentation({
		book: loadState.phase === "ready" ? loadState.data : null,
		preference: presentationPreference,
		defaultTextLayout: settings.textLayout,
		visualLayout: settings.visualLayout,
	});
	const isVisual = presentation.renderer === "visual";
	const isPdf = presentation.renderer === "pdf";
	const visualDirection =
		isVisual && loadState.phase === "ready"
			? resolveVisualReadingDirection(
					visualSettings.readingDirection,
					loadState.data.language,
					loadState.data.presentation?.pageProgressionDirection,
				)
			: undefined;

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

	const galleryPictures = useMemo(() => {
		if (loadState.phase !== "ready") return [];
		const urls = loadState.html.match(/blob:[^"')\s]+/g) ?? [];
		return [...new Set(urls)].map((url) => ({ url }));
	}, [loadState]);

	useReaderKeybinds({
		apiRef,
		presentation,
		verticalMode,
		visualDirection: visualDirection,
		galleryOpen,
		tocOpen,
		settingsOpen: quickSettingsOpen && isMobile,
		navigationBlocked: reservePlayerSpace && isAudioPlayerExpanded,
		onCloseToc: () => setTocOpen(false),
		onCloseSettings: closeQuickSettings,
		onChangeChapter: changeChapter,
		onSaveReadingPoint: saveReadingPoint,
		onGoToReadingPoint: readerSession.manualPoint.position
			? goToReadingPoint
			: undefined,
	});

	const completeBook = async () => {
		try {
			await readingTracker.completeReading();
			const total = bookCharCountRef.current;
			await readerApi().readingProgress.saveProgress({
				bookUuid: uuid,
				exploredCharCount: total,
				bookCharCount: total,
				status: "completed",
				positionIntentAt: Date.now(),
			});
			readerHost().onProgressSaved();
			readerHost().onReadingSessionEnded();
			await onBookCompleted();
		} catch {
			readerHost().notifyError(m.reading_error());
		}
	};

	const onFullscreenClick = () => {
		if (document.fullscreenElement) {
			document.exitFullscreen().catch(() => {});
		} else {
			document.documentElement.requestFullscreen().catch(() => {});
		}
	};

	const exitReader = onExit;
	const sessionControl = (tracker: ReadingTracker) => (
		<ReadingSessionControl tracker={tracker} surface={readerSurface(theme)} />
	);

	if (loadState.phase === "error") {
		return (
			<div className="flex h-dvh flex-col items-center justify-center gap-4 font-reader-sans">
				{readerSync}
				<p className="text-destructive text-lg">{loadState.message}</p>
				<button type="button" onClick={onExit} className="underline">
					Back to book
				</button>
			</div>
		);
	}

	if (loadState.phase !== "ready") {
		return (
			<>
				{readerSync}
				<ReaderLoadingScreen
					state={loadState}
					reservePlayerSpace={reservePlayerSpace}
				/>
			</>
		);
	}

	const { data: loadedData, html } = loadState;
	const data =
		isPdf && pdfDocumentPageCount
			? {
					...loadedData,
					characters: pdfDocumentPageCount,
					sections: createPdfSections(pdfDocumentPageCount),
				}
			: loadedData;
	// Structural remounts (view/writing mode change) restore the position the
	// reader was at, not the original load-time position.
	const initialPosition =
		readerSessionRef.current?.snapshot().position ??
		(exploredRef.current >= 0
			? {
					exploredCharCount: exploredRef.current,
					progress: data.characters ? exploredRef.current / data.characters : 0,
					modifiedAt: positionClockRef.current || Date.now(),
				}
			: loadState.position);

	// Only truly structural settings remount the reader (different component /
	// different scroll axis). Everything else — fonts, sizes, margins, furigana,
	// columns, theme — applies live via re-render + api.relayout(). The reader
	// always renders the committed profile settings.
	const readerKey = [
		uuid,
		// Focus has a mode-neutral sentence index and updates its writing mode
		// live. Keep that projection mounted so horizontal/vertical switches do
		// not discard the prepared document or reset the active sentence.
		presentation.renderer === "text-focus" ? "" : settings.writingMode,
		isVisual ? presentation.visualLayout : "",
		(presentation.renderer === "text-paginated" ||
			(presentation.renderer === "text-scroll" &&
				settings.writingMode === "vertical-rl")) &&
			reservePlayerSpace,
	].join("|");
	let currentVisualPage = 1;
	for (let index = 0; index < data.sections.length; index += 1) {
		if ((data.sections[index]?.startCharacter ?? index) > exploredCharCount)
			break;
		currentVisualPage = index + 1;
	}

	return (
		<main
			ref={readerSurfaceRef}
			data-read-listen-active={readListenActive}
			inert={reservePlayerSpace && isAudioPlayerExpanded}
			aria-label={bookTitle}
			tabIndex={-1}
			className={`reader-route-content h-[calc(100dvh-var(--reader-player-reserve-current))] w-dvw overscroll-none font-reader-sans ${
				presentation.renderer === "text-scroll"
					? "overflow-auto"
					: "overflow-hidden"
			}`}
			style={
				{
					backgroundColor: theme.backgroundColor,
					scrollbarGutter:
						presentation.renderer === "text-scroll" ? "stable" : undefined,
					"--player-height": "88px",
					"--player-reserve":
						"calc(var(--player-height) + var(--safe-area-bottom))",
					"--reader-player-reserve-mobile": reservePlayerSpace
						? "calc(var(--mobile-player-height) + var(--safe-area-bottom))"
						: "var(--safe-area-bottom)",
					"--reader-player-reserve-desktop": reservePlayerSpace
						? "var(--player-reserve)"
						: "var(--safe-area-bottom)",
				} as CSSProperties
			}
		>
			{readerSync}
			<FocusReaderScrollContainer
				key={readListenActive ? "read-listen" : "reader"}
				containerRef={readerSurfaceRef}
			/>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: book stylesheet sanitized by formatStyleSheet */}
			<style dangerouslySetInnerHTML={styleSheetHtml} />
			<div
				className="contents"
				inert={(quickSettingsOpen && isMobile) || tocOpen || galleryOpen}
			>
				<ReaderEngine
					key={readerKey}
					bookUuid={uuid}
					presentation={presentation}
					book={data}
					htmlContent={html}
					theme={theme}
					readerSettings={effectiveReaderSettings}
					visualSettings={visualSettings}
					initialPosition={initialPosition}
					onPositionChange={handlePositionChange}
					onSectionProgressChange={setSectionProgress}
					onToggleChrome={() => setShowHeader((open) => !open)}
					onPdfExit={exitReader}
					onPdfCompleteBook={completeBook}
					onPdfFullscreen={onFullscreenClick}
					onPdfOpenSettings={() => {
						overlayEntryPositionRef.current = captureReaderPosition();
						if (isMobile) hideDocumentScrollbar();
						setQuickSettingsOpen(true);
					}}
					onExitFocus={() =>
						handlePresentationChange({ type: "text-layout", value: "scroll" })
					}
					navigationBlocked={
						(quickSettingsOpen && isMobile) ||
						tocOpen ||
						galleryOpen ||
						(reservePlayerSpace && isAudioPlayerExpanded)
					}
					reservePlayerSpace={reservePlayerSpace}
					scrollContainerRef={readerSurfaceRef}
					controllerRef={(controller: BookReaderApi | null) => {
						apiRef.current = controller;
						if (controller) {
							setReaderApiRevision((revision) => revision + 1);
							// A flow/orientation switch can replace the controller while an
							// overlay is still open; keep its modal lock gutter-free.
							if ((quickSettingsOpen && isMobile) || galleryOpen) {
								if (supportsReaderScrollbar(controller)) {
									controller.setScrollbarHidden(true);
								}
							}
						}
					}}
					pdfSource={loadState.pdfSource}
					pdfHeader={{
						bookTitle,
						sessionControl: sessionControl(readingTracker),
					}}
					lazyBook={loadState.lazyBook}
					onPdfDocumentReady={handlePdfDocumentReady}
				/>
			</div>

			{readListen?.render({
				runtime,
				sections: data.sections,
				sourceFormat: data.sourceFormat,
				lazyBook: loadState.lazyBook,
				domRevision: `${readerKey}:${readerApiRevision}`,
				pauseAudioAfterLine:
					presentation.renderer === "text-focus" &&
					settings.focusPauseAudioAfterLine,
				theme,
			})}
			{!isPdf && showHeader && (
				<button
					type="button"
					aria-label="Hide reader menu"
					className="fixed inset-0 z-[9]"
					onClick={() => setShowHeader(false)}
				/>
			)}
			{/* Text and image readers use the shared activity-rail-style header. */}
			{!isPdf && (
				<ReaderHeader
					sessionControl={sessionControl(readingTracker)}
					open={showHeader}
					onOpen={() => setShowHeader(true)}
					theme={theme}
					bookTitle={bookTitle}
					hasChapterData={sectionProgress.size > 0}
					searchAvailable={false}
					onTocClick={() => {
						setShowHeader(false);
						setTocOpen(true);
					}}
					onCompleteBook={completeBook}
					onFullscreenClick={onFullscreenClick}
					hasImages={galleryPictures.length > 0}
					onImageGalleryClick={() => {
						setShowHeader(false);
						hideDocumentScrollbar();
						setGalleryOpen(true);
					}}
					onSearchClick={() => {}}
					onQuickSettingsClick={() => {
						overlayEntryPositionRef.current = captureReaderPosition();
						if (isMobile) hideDocumentScrollbar();
						setQuickSettingsOpen(true);
					}}
					readListenAvailable={Boolean(!isPdfBook && readListen?.available)}
					readListenActive={readListenActive}
					onReadListenClick={() => readListen?.toggle(runtime)}
					onExitClick={exitReader}
				/>
			)}

			<ReaderFooter
				passThrough={isVisual || isPdf}
				theme={theme}
				exploredCharCount={exploredCharCount}
				bookCharCount={data.characters}
				showCharacterCounter={settings.showCharacterCounter}
				showPercentage={settings.showPercentage}
				reservePlayerSpace={reservePlayerSpace}
				visualProgress={
					isVisual || isPdf
						? {
								currentPage: currentVisualPage,
								pageCount: data.sections.length,
								style: visualSettings.progressStyle,
							}
						: undefined
				}
			/>

			{tocOpen && (
				<ReaderToc
					theme={theme}
					sectionProgress={sectionProgress}
					exploredCharCount={exploredCharCount}
					verticalMode={verticalMode}
					onNavigate={(reference) => {
						readingTracker.markJump();
						apiRef.current?.navigateToSection(reference);
					}}
					onClose={() => setTocOpen(false)}
				/>
			)}

			<ReaderReadingPoint
				position={readerSession.manualPoint.position}
				sections={data.sections}
				total={data.characters}
				renderer={presentation.renderer}
				theme={theme}
				onSave={saveReadingPoint}
				onGo={goToReadingPoint}
			/>
			<ReaderQuickSettings
				profilesConflict={profilesConflict}
				onResolveProfilesConflict={resolveReaderProfileConflict}
				manualSaving={readerSession.manualPoint.manual}
				onManualSavingChange={changeManualSaving}
				open={quickSettingsOpen}
				presentation={presentation}
				visualSettings={visualSettings}
				settings={settings}
				theme={theme}
				customThemes={customThemes}
				profiles={profilesStore.profiles}
				activeProfileId={activeProfileId}
				isMobile={isMobile}
				readListenActive={readListenActive}
				onProfileSwitch={handleQuickProfileSwitch}
				onProfileCreate={handleProfileCreate}
				onProfileRename={handleProfileRename}
				onProfileDuplicate={handleProfileDuplicate}
				onProfileDelete={handleProfileDelete}
				onCustomThemeSave={handleCustomThemeSave}
				onCustomThemeDelete={handleCustomThemeDelete}
				onCustomThemePreview={handleCustomThemePreview}
				onCustomThemePreviewCancel={handleCustomThemePreviewCancel}
				onChange={handleQuickSettingsChange}
				onVisualSettingsChange={handleVisualSettingsChange}
				onPresentationChange={handlePresentationChange}
				onClose={closeQuickSettings}
			/>

			{galleryOpen && (
				<ReaderImageGallery
					theme={theme}
					pictures={galleryPictures}
					onClose={() => {
						restoreDocumentScrollbar(settings.theme);
						setGalleryOpen(false);
					}}
				/>
			)}
		</main>
	);
}
