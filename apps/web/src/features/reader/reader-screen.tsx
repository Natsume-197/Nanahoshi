import { ebookSourceFormatForFilename } from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import {
	type CSSProperties,
	type RefObject,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";
import { ReadListenRuntime } from "@/components/read-listen/read-listen-runtime";
import {
	useAudioPlayerActions,
	useAudioPlayerBook,
	useAudioPlayerExpanded,
} from "@/context/audio-player-context";
import { createPdfSections } from "@/features/reader/document/pdf-source";
import type {
	ReaderPosition,
	SectionWithProgress,
} from "@/features/reader/document/types";
import { useBookLoader } from "@/features/reader/interaction/use-book-loader";
import { useReaderKeybinds } from "@/features/reader/interaction/use-reader-keybinds";
import { useReaderSync } from "@/features/reader/interaction/use-reader-sync";
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
} from "@/features/reader/presentation/profiles";
import {
	loadReaderPresentationPreference,
	type ReaderPresentation,
	type ReaderPresentationChange,
	type ReaderPresentationPreference,
	resolveReaderPresentation,
	saveReaderPresentationPreference,
	updateReaderPresentationPreference,
} from "@/features/reader/presentation/reader-presentation";
import {
	type CustomReaderThemes,
	getReaderScrollbarColor,
	getReaderScrollbarTrackColor,
	getReaderTheme,
	loadCustomThemes,
	type ReaderSettings,
} from "@/features/reader/presentation/settings";
import {
	loadVisualReaderSettings,
	saveVisualReaderSettings,
	type VisualReaderSettings,
} from "@/features/reader/presentation/visual-settings";
import {
	type BookReaderApi,
	supportsReaderAutoScroll,
	supportsReaderScrollbar,
} from "@/features/reader/reader-contract";
import { ReaderEngine } from "@/features/reader/renderers/reader-engine";
import { getReaderScrollbarWidth } from "@/features/reader/renderers/shared/reader-document-chrome";
import { resolveVisualReadingDirection } from "@/features/reader/renderers/visual/book-reader-visual";
import { useReaderSession } from "@/features/reader/session/reader-session";
import { ReaderFooter } from "@/features/reader/ui/chrome/reader-footer";
import { ReaderHeader } from "@/features/reader/ui/chrome/reader-header";
import { ReaderImageGallery } from "@/features/reader/ui/chrome/reader-image-gallery";
import { ReaderLoadingScreen } from "@/features/reader/ui/chrome/reader-loading-screen";
import { ReaderToc } from "@/features/reader/ui/chrome/reader-toc";
import { ReaderQuickSettings } from "@/features/reader/ui/settings/reader-quick-settings";
import { ReaderSettingsOverlay } from "@/features/reader/ui/settings/reader-settings";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { usePresenceEvents } from "@/hooks/use-presence-events";
import { usePresenceIdle } from "@/hooks/use-presence-idle";
import { useSyncActiveOrg } from "@/hooks/use-sync-active-org";
import { authClient } from "@/lib/auth-client";
import {
	invalidateReadingProgress,
	invalidateRecommendations,
} from "@/lib/invalidate-progress";
import { findReadyReadListenPairing } from "@/lib/read-listen/pairing";
import {
	disableReadListenReader,
	loadReadListenReaderSession,
	navigateReadListenReaderMode,
	planReadListenReaderExit,
	rememberReadListenReaderPosition,
	resolveReadListenReaderPosition,
} from "@/lib/read-listen/reader-session";
import { transitionReadListenNavigation } from "@/lib/read-listen/view-transition";
import { resetThemeColor, setThemeColor } from "@/lib/theme-color";
import { client, orpc } from "@/utils/orpc";
import "@/features/reader/ui/styles/reader.css";
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

interface ReaderScreenProps {
	book: ReaderScreenBook | null | undefined;
	switchedOrgId: string | null | undefined;
	uuid: string;
	readListenPairUuid?: string;
}

export function ReaderRoutePending() {
	const audioPlayerBook = useAudioPlayerBook();
	return (
		<ReaderLoadingScreen
			state={{ phase: "loading" }}
			entering
			reservePlayerSpace={Boolean(audioPlayerBook)}
		/>
	);
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
	"secondDimensionMaxValue",
	"firstDimensionMargin",
	"hideFurigana",
	"furiganaStyle",
	"avoidPageBreak",
	"pageColumns",
]);

function RestoreReadListenPosition({
	position,
	stop,
	restore,
}: {
	position: ReaderPosition;
	stop: () => void;
	restore: (position: ReaderPosition) => void;
}) {
	useMountEffect(() => {
		stop();
		let restoreFrame = 0;
		const layoutFrame = requestAnimationFrame(() => {
			restoreFrame = requestAnimationFrame(() => restore(position));
		});
		return () => {
			cancelAnimationFrame(layoutFrame);
			cancelAnimationFrame(restoreFrame);
		};
	});
	return null;
}

function PersistReadListenPositionOnExit({
	getCurrentPosition,
	rememberPosition,
}: {
	getCurrentPosition: () => ReaderPosition | undefined;
	rememberPosition: (position: ReaderPosition) => void;
}) {
	useMountEffect(() => () => {
		const position = getCurrentPosition();
		if (position) rememberPosition(position);
	});
	return null;
}

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
	switchedOrgId,
	uuid,
	readListenPairUuid,
}: ReaderScreenProps) {
	const bookSourceFormat = book?.filename
		? (ebookSourceFormatForFilename(book.filename) ?? undefined)
		: undefined;
	const isPdfBook = bookSourceFormat === "pdf";
	const isAudioPlayerExpanded = useAudioPlayerExpanded();
	const audioPlayerBook = useAudioPlayerBook();
	const { stop } = useAudioPlayerActions();
	const navigate = useNavigate();
	const router = useRouter();
	const isMobile = useIsMobile();
	const pairingsQuery = useQuery(
		orpc.readListen.getPairings.queryOptions({
			input: { publicationUuid: uuid },
		}),
	);
	const readyReadListenPairing = findReadyReadListenPairing(
		pairingsQuery.data?.pairings,
	);
	const readListenAvailable = Boolean(
		!isPdfBook && (readListenPairUuid || readyReadListenPairing),
	);

	useSyncActiveOrg(switchedOrgId);

	// The reader is a full-page route outside DashboardLayout, so it would
	// otherwise drop the presence connection and flip the user to "away" mid-read.
	// Keeping the SSE alive here holds them "online" (and "reading" via the sync).
	usePresenceEvents();
	usePresenceIdle();

	const [profilesStore, setProfilesStore] =
		useState<ReaderProfilesStore>(loadProfilesStore);
	const [activeProfileId, setActiveProfileIdState] = useState<string>(() =>
		getActiveProfileId(profilesStore),
	);
	const [settings, setSettings] = useState<ReaderSettings>(() =>
		getProfileSettings(profilesStore, activeProfileId),
	);
	const [visualSettings, setVisualSettings] = useState<VisualReaderSettings>(
		loadVisualReaderSettings,
	);
	const [presentationPreference, setPresentationPreference] =
		useState<ReaderPresentationPreference>(() =>
			loadReaderPresentationPreference(uuid),
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
	const initialReadListenSession = readListenPairUuid
		? loadReadListenReaderSession({ pairUuid: readListenPairUuid })
		: undefined;
	const readListenPositionRef = useRef<ReaderPosition | undefined>(undefined);
	const readListenPlayheadRef = useRef<number | undefined>(
		initialReadListenSession?.positionPlayheadSeconds,
	);
	const loadedReadListenPairRef = useRef(readListenPairUuid);
	if (
		readListenPairUuid &&
		readListenPairUuid !== loadedReadListenPairRef.current
	) {
		loadedReadListenPairRef.current = readListenPairUuid;
		const session = loadReadListenReaderSession({
			pairUuid: readListenPairUuid,
		});
		readListenPositionRef.current = undefined;
		readListenPlayheadRef.current = session?.positionPlayheadSeconds;
	}
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
	const draftSettingsRef = useRef(draftSettings);
	draftSettingsRef.current = draftSettings;
	const previousUuidRef = useRef(uuid);
	if (uuid !== previousUuidRef.current) {
		previousUuidRef.current = uuid;
		setPresentationPreference(loadReaderPresentationPreference(uuid));
		setPdfDocumentPageCount(null);
		overlayEntryPositionRef.current = undefined;
		readListenPositionRef.current = undefined;
		readListenPlayheadRef.current = undefined;
	}

	const rememberReadListenPosition = useCallback(
		(position: ReaderPosition) => {
			readListenPositionRef.current = position;
			exploredRef.current = position.exploredCharCount;
			if (readListenPairUuid && readListenPlayheadRef.current !== undefined) {
				rememberReadListenReaderPosition({
					pairUuid: readListenPairUuid,
					position,
					playheadSeconds: readListenPlayheadRef.current,
				});
			}
		},
		[readListenPairUuid],
	);

	const toggleReadListen = () => {
		if (readListenPairUuid) {
			void disableReadListenReader({
				getCurrentPosition: () =>
					resolveReadListenReaderPosition({
						livePosition: apiRef.current?.getPosition(),
						exploredCharCount: exploredRef.current,
						rememberedPosition: readListenPositionRef.current,
						bookCharCount: bookCharCountRef.current,
					}),
				rememberPosition: rememberReadListenPosition,
				leaveMode: async () => {
					await navigateReadListenReaderMode({
						navigate: (options) => navigate(options),
						uuid,
					});
				},
			});
			return;
		}
		if (!readyReadListenPairing) return;
		const position = resolveReadListenReaderPosition({
			livePosition: apiRef.current?.getPosition(),
			exploredCharCount: exploredRef.current,
			rememberedPosition: readListenPositionRef.current,
			bookCharCount: bookCharCountRef.current,
		});
		if (position) {
			readListenPositionRef.current = position;
		}
		void navigateReadListenReaderMode({
			navigate: (options) => navigate(options),
			uuid,
			pairUuid: readyReadListenPairing.id,
		});
	};
	const exitReadListen = useCallback(() => {
		void disableReadListenReader({
			getCurrentPosition: () =>
				resolveReadListenReaderPosition({
					livePosition: apiRef.current?.getPosition(),
					exploredCharCount: exploredRef.current,
					rememberedPosition: readListenPositionRef.current,
					bookCharCount: bookCharCountRef.current,
				}),
			rememberPosition: rememberReadListenPosition,
			leaveMode: () =>
				transitionReadListenNavigation({
					direction: "exit",
					update: async () => {
						const exit = planReadListenReaderExit({
							session: readListenPairUuid
								? loadReadListenReaderSession({ pairUuid: readListenPairUuid })
								: undefined,
							currentHistoryIndex:
								router.latestLocation.state.__TSR_index ??
								router.history.location.state.__TSR_index,
							fallbackAudiobookUuid: audioPlayerBook?.uuid,
							fallbackEbookUuid: uuid,
						});
						if (exit.type === "back") {
							await new Promise<void>((resolve) => {
								const unsubscribe = router.subscribe("onResolved", () => {
									unsubscribe();
									resolve();
								});
								router.history.back();
							});
							return;
						}
						await router.navigate({ href: exit.href });
					},
				}),
		});
	}, [
		audioPlayerBook,
		readListenPairUuid,
		rememberReadListenPosition,
		router,
		uuid,
	]);

	const bookTitle = book?.title ?? book?.filename ?? "Book";
	const { data: activeOrg } = authClient.useActiveOrganization();
	// The book's server: its own org when opened cross-org, else the active one.
	const bookServerId = switchedOrgId ?? activeOrg?.id ?? null;
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
		fileName: book?.filename,
		pageCount: book?.pageCount,
		sourceFormat: bookSourceFormat,
		language: book?.languageCode,
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

	const handlePdfDocumentReady = useCallback((pageCount: number) => {
		setBookCharCount(pageCount);
		setPdfDocumentPageCount((current) =>
			current === pageCount ? current : pageCount,
		);
	}, []);

	const getCharCounts = useCallback(() => {
		const position = capturePosition(() => apiRef.current?.getPosition());
		return {
			exploredCharCount: position?.exploredCharCount,
			bookCharCount: bookCharCountRef.current,
			positionIntentAt: position?.modifiedAt,
		};
	}, []);

	useReaderSync({
		bookUuid: uuid,
		enabled:
			loadState.phase === "ready" &&
			(!isPdfBook || pdfDocumentPageCount !== null) &&
			bookCharCountRef.current > 0,
		getCharCounts,
	});

	const handlePositionChange = (nextPosition: ReaderPosition) => {
		const position = reportPosition(nextPosition);
		if (!position) return;
		// Quick Settings is deliberately non-modal so the navbar remains usable.
		// If the reader is also moved behind the sheet, that genuine reading input
		// becomes the new reflow anchor instead of snapping to the opening point.
		if (quickSettingsOpen) overlayEntryPositionRef.current = position;
	};

	const captureReaderPosition = () => {
		return capturePosition(() => apiRef.current?.getPosition());
	};

	// Direct commit path, used by keybinds while the overlay is closed
	// (autoscroll speed) — these never touch the book layout.
	const handleSettingsChange = (patch: Partial<ReaderSettings>) => {
		const next = { ...settings, ...patch };
		settingsRef.current = next;
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
		setVisualSettings((current) => {
			const next = { ...current, ...patch };
			saveVisualReaderSettings(next);
			return next;
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
		const preference = updateReaderPresentationPreference(presentation, change);
		setPresentationPreference(preference);
		saveReaderPresentationPreference(uuid, preference);
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
		// Do this synchronously before mounting a Base UI modal. Its scroll lock
		// otherwise sees the EPUB's hidden intrinsic overflow, reserves a body
		// gutter, and may expose an off-axis document scrollbar.
		document.documentElement.style.setProperty("scrollbar-width", "none");
		const readerApi = apiRef.current;
		if (supportsReaderScrollbar(readerApi)) {
			readerApi.setScrollbarHidden(true);
		}
	};

	const restoreDocumentScrollbar = (themeId: string) => {
		const readerTheme = getReaderTheme(themeId, customThemesRef.current);
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

	const openSettings = () => {
		overlayEntryPositionRef.current ??= captureReaderPosition();
		hideDocumentScrollbar();
		setDraftSettings(settings);
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

	const closeSettings = () => {
		const next = draftSettings;
		const position = overlayEntryPositionRef.current ?? captureReaderPosition();
		setDraftSettings(null);
		if (!next) return;

		restoreDocumentScrollbar(next.theme);
		settingsRef.current = next;
		setSettings(next);
		setProfilesStore(
			commitProfilesStore(
				setProfileSettings(profilesStore, activeProfileId, next),
			),
		);
		applyCommittedSettings(next, settings, position);
		overlayEntryPositionRef.current = undefined;
	};

	// Swaps the live settings for another profile's (overlay closed): restyles
	// the page chrome and remounts/relayouts the book like a settings commit.
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
	const presentation: ReaderPresentation = resolveReaderPresentation({
		book: loadState.phase === "ready" ? loadState.data : null,
		preference: presentationPreference,
		defaultTextLayout: settings.textLayout,
		visualLayout: visualSettings.layout,
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
		autoScrollMultiplier: settings.autoScrollMultiplier,
		galleryOpen,
		tocOpen,
		settingsOpen: settingsOpen || quickSettingsOpen,
		navigationBlocked: Boolean(audioPlayerBook) && isAudioPlayerExpanded,
		onCloseToc: () => setTocOpen(false),
		onCloseSettings: () => {
			if (quickSettingsOpen) closeQuickSettings();
			else closeSettings();
		},
		onChangeChapter: changeChapter,
		onAutoScrollMultiplierChange: (next) => {
			handleSettingsChange({ autoScrollMultiplier: next });
			const readerApi = apiRef.current;
			if (supportsReaderAutoScroll(readerApi)) {
				readerApi.setAutoScrollMultiplier(next);
			}
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

	const exitReader = () => {
		const exit = () =>
			navigate({ to: "/dashboard/books/$uuid", params: { uuid } });
		if (!readListenPairUuid) {
			void exit();
			return;
		}
		void transitionReadListenNavigation({ direction: "exit", update: exit });
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
		return (
			<ReaderLoadingScreen
				state={loadState}
				reservePlayerSpace={Boolean(audioPlayerBook)}
			/>
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
	const readListenEntryCharacter =
		readListenPositionRef.current?.exploredCharCount;
	// Structural remounts (view/writing mode change) restore the position the
	// reader was at, not the original load-time position.
	const initialPosition =
		readerSessionRef.current.snapshot().position ??
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
	// always renders the committed settings, so draft edits in the overlay
	// never touch it until closeSettings().
	const readerKey = [
		uuid,
		presentation.renderer,
		settings.writingMode,
		isVisual ? presentation.visualLayout : "",
		(presentation.renderer === "text-paginated" ||
			(presentation.renderer === "text-scroll" &&
				settings.writingMode === "vertical-rl")) &&
			Boolean(audioPlayerBook),
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
			data-read-listen-active={Boolean(readListenPairUuid)}
			inert={Boolean(audioPlayerBook) && isAudioPlayerExpanded}
			aria-label={bookTitle}
			tabIndex={-1}
			className="reader-route-content h-[calc(100dvh-var(--reader-player-reserve-current))] overflow-auto overscroll-none font-reader-sans"
			style={
				{
					backgroundColor: theme.backgroundColor,
					"--player-height": "88px",
					"--player-reserve":
						"calc(var(--player-height) + var(--safe-area-bottom))",
					"--reader-player-reserve-mobile": audioPlayerBook
						? "calc(var(--mobile-player-height) + var(--safe-area-bottom))"
						: "var(--safe-area-bottom)",
					"--reader-player-reserve-desktop": audioPlayerBook
						? "var(--player-reserve)"
						: "var(--safe-area-bottom)",
				} as CSSProperties
			}
		>
			<FocusReaderScrollContainer
				key={readListenPairUuid ?? "reader"}
				containerRef={readerSurfaceRef}
			/>
			{/* biome-ignore lint/security/noDangerouslySetInnerHtml: book stylesheet sanitized by formatStyleSheet */}
			<style dangerouslySetInnerHTML={styleSheetHtml} />
			{!readListenPairUuid && readListenPositionRef.current && (
				<RestoreReadListenPosition
					key={readListenPositionRef.current.modifiedAt}
					position={readListenPositionRef.current}
					stop={stop}
					restore={(position) => {
						const readerApi = apiRef.current;
						if (!readerApi) return;
						exploredRef.current = position.exploredCharCount;
						readerApi.scrollToPosition(position);
					}}
				/>
			)}

			<div
				className="contents"
				inert={settingsOpen || quickSettingsOpen || tocOpen || galleryOpen}
			>
				<ReaderEngine
					key={readerKey}
					bookUuid={uuid}
					presentation={presentation}
					book={data}
					htmlContent={html}
					theme={theme}
					readerSettings={settings}
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
						hideDocumentScrollbar();
						setQuickSettingsOpen(true);
					}}
					onExitFocus={() =>
						handlePresentationChange({ type: "text-layout", value: "scroll" })
					}
					navigationBlocked={
						settingsOpen ||
						quickSettingsOpen ||
						tocOpen ||
						galleryOpen ||
						(Boolean(audioPlayerBook) && isAudioPlayerExpanded)
					}
					reservePlayerSpace={Boolean(audioPlayerBook)}
					scrollContainerRef={readerSurfaceRef}
					controllerRef={(controller: BookReaderApi | null) => {
						apiRef.current = controller;
						if (controller) {
							setReaderApiRevision((revision) => revision + 1);
							// A flow/orientation switch can replace the controller while an
							// overlay is still open; keep its modal lock gutter-free.
							if (quickSettingsOpen || settingsOpen || galleryOpen) {
								if (supportsReaderScrollbar(controller)) {
									controller.setScrollbarHidden(true);
								}
							}
						}
					}}
					pdfSource={loadState.pdfSource}
					lazyBook={loadState.lazyBook}
					onPdfDocumentReady={handlePdfDocumentReady}
				/>
			</div>

			{readListenPairUuid &&
				!loadState.lazyBook &&
				data.sourceFormat &&
				data.sourceFormat !== "pdf" && (
					<>
						<ReadListenRuntime
							key={`${readListenPairUuid}:${readListenEntryCharacter ?? "audio"}`}
							pairUuid={readListenPairUuid}
							ebookUuid={uuid}
							sourceFormat={data.sourceFormat}
							readerApiRef={apiRef}
							readerSurfaceRef={readerSurfaceRef}
							sections={data.sections}
							initialTextPosition={readListenEntryCharacter}
							readerDomRevision={`${readerKey}:${readerApiRevision}`}
							playheadRef={readListenPlayheadRef}
							theme={theme}
							onExitReadListen={exitReadListen}
						/>
						<PersistReadListenPositionOnExit
							key={`persist:${readListenPairUuid}`}
							getCurrentPosition={() =>
								resolveReadListenReaderPosition({
									livePosition: apiRef.current?.getPosition(),
									exploredCharCount: exploredRef.current,
									rememberedPosition: readListenPositionRef.current,
									bookCharCount: bookCharCountRef.current,
								})
							}
							rememberPosition={rememberReadListenPosition}
						/>
					</>
				)}
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
						hideDocumentScrollbar();
						setQuickSettingsOpen(true);
					}}
					readListenAvailable={readListenAvailable}
					readListenActive={Boolean(readListenPairUuid)}
					onReadListenClick={toggleReadListen}
					onExitClick={exitReader}
				/>
			)}

			{!isPdf && (
				<ReaderFooter
					passThrough={isVisual}
					theme={theme}
					exploredCharCount={exploredCharCount}
					bookCharCount={data.characters}
					showCharacterCounter={settings.showCharacterCounter}
					showPercentage={settings.showPercentage}
					reservePlayerSpace={Boolean(audioPlayerBook)}
					visualProgress={
						isVisual
							? {
									currentPage: currentVisualPage,
									pageCount: data.sections.length,
									style: visualSettings.progressStyle,
								}
							: undefined
					}
				/>
			)}

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

			<ReaderQuickSettings
				open={quickSettingsOpen}
				presentation={presentation}
				visualSettings={visualSettings}
				settings={settings}
				theme={theme}
				customThemes={customThemes}
				profiles={profilesStore.profiles}
				activeProfileId={activeProfileId}
				isMobile={isMobile}
				onProfileSwitch={handleQuickProfileSwitch}
				onProfileCreate={handleProfileCreate}
				onProfileRename={handleProfileRename}
				onProfileDuplicate={handleProfileDuplicate}
				onProfileDelete={handleProfileDelete}
				onCustomThemesChange={handleCustomThemesChange}
				onChange={handleQuickSettingsChange}
				onVisualSettingsChange={handleVisualSettingsChange}
				onPresentationChange={handlePresentationChange}
				onOpenSettings={() => {
					setQuickSettingsOpen(false);
					openSettings();
				}}
				onClose={closeQuickSettings}
			/>

			{draftSettings && (
				<ReaderSettingsOverlay
					presentation={presentation}
					settings={draftSettings}
					customThemes={customThemes}
					onChange={handleDraftChange}
					onPresentationChange={handlePresentationChange}
					onClose={closeSettings}
				/>
			)}

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
