import { ebookSourceFormatForFilename } from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	useLoaderData,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import {
	type CSSProperties,
	type RefObject,
	useCallback,
	useMemo,
	useRef,
	useState,
} from "react";
import { z } from "zod";
import { ReadListenRuntime } from "@/components/read-listen/read-listen-runtime";
import { ReaderEngine } from "@/components/reader/reader-engine";
import { ReaderFooter } from "@/components/reader/reader-footer";
import { ReaderHeader } from "@/components/reader/reader-header";
import { ReaderImageGallery } from "@/components/reader/reader-image-gallery";
import { ReaderLoadingScreen } from "@/components/reader/reader-loading-screen";
import { ReaderQuickSettings } from "@/components/reader/reader-quick-settings";
import { ReaderSettingsOverlay } from "@/components/reader/reader-settings";
import type { BookReaderApi } from "@/components/reader/reader-shared-props";
import { ReaderToc } from "@/components/reader/reader-toc";
import { useBookLoader } from "@/components/reader/use-book-loader";
import { useReaderKeybinds } from "@/components/reader/use-reader-keybinds";
import { useReaderSync } from "@/components/reader/use-reader-sync";
import {
	useAudioPlayerActions,
	useAudioPlayerBook,
	useAudioPlayerExpanded,
} from "@/context/audio-player-context";
import { getBook } from "@/functions/books/get-book";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { usePresenceEvents } from "@/hooks/use-presence-events";
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
import { saveLocalBookmark } from "@/lib/reader/local-bookmark";
import { saveLocalReadingPosition } from "@/lib/reader/local-reading-position";
import { resolveMangaReadingDirection } from "@/lib/reader/manga-pagination";
import {
	loadMangaReaderSettings,
	type MangaReaderSettings,
	saveMangaReaderSettings,
} from "@/lib/reader/manga-settings";
import { createPdfSections } from "@/lib/reader/pdf-source";
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
	loadReaderPresentationPreference,
	type ReaderPresentation,
	type ReaderPresentationChange,
	type ReaderPresentationPreference,
	resolveReaderPresentation,
	saveReaderPresentationPreference,
	updateReaderPresentationPreference,
} from "@/lib/reader/reader-presentation";
import {
	type CustomReaderThemes,
	getReaderScrollbarColor,
	getReaderScrollbarTrackColor,
	getReaderTheme,
	loadCustomThemes,
	type ReaderSettings,
} from "@/lib/reader/settings";
import { getReaderScrollbarWidth } from "@/lib/reader/shared/reader-document-chrome";
import type { ReaderBookmark, SectionWithProgress } from "@/lib/reader/types";
import { resetThemeColor, setThemeColor } from "@/lib/theme-color";
import { client, orpc } from "@/utils/orpc";
import "@/components/reader/reader.css";
// Bundled CJK fonts: vertical-rl text renders garbled glyph overlaps when the
// requested family is missing and the system serif lacks vertical metrics.
import "@fontsource/noto-serif-jp/japanese-400.css";
import "@fontsource/noto-serif-jp/japanese-700.css";
import "@fontsource/noto-sans-jp/japanese-400.css";
import "@fontsource/noto-sans-jp/japanese-700.css";

export const Route = createFileRoute("/reader/$uuid")({
	component: ReaderPage,
	pendingComponent: ReaderRoutePending,
	pendingMs: 0,
	pendingMinMs: 0,
	validateSearch: z.object({
		pair: z.string().uuid().optional(),
	}),
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

function ReaderRoutePending() {
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
	position: ReaderBookmark;
	stop: () => void;
	restore: (position: ReaderBookmark) => void;
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
	getCurrentPosition: () => ReaderBookmark | undefined;
	rememberPosition: (position: ReaderBookmark) => void;
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

function ReaderPage() {
	const { book, switchedOrgId } = useLoaderData({ from: "/reader/$uuid" });
	const { uuid } = Route.useParams();
	const bookSourceFormat = book?.filename
		? (ebookSourceFormatForFilename(book.filename) ?? undefined)
		: undefined;
	const isPdfBook = bookSourceFormat === "pdf";
	const { pair: readListenPairUuid } = Route.useSearch();
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

	const [profilesStore, setProfilesStore] =
		useState<ReaderProfilesStore>(loadProfilesStore);
	const [activeProfileId, setActiveProfileIdState] = useState<string>(() =>
		getActiveProfileId(profilesStore),
	);
	const [settings, setSettings] = useState<ReaderSettings>(() =>
		getProfileSettings(profilesStore, activeProfileId),
	);
	const [mangaSettings, setMangaSettings] = useState<MangaReaderSettings>(
		loadMangaReaderSettings,
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
	const [exploredCharCount, setExploredCharCount] = useState(0);
	const [sectionProgress, setSectionProgress] = useState<
		Map<string, SectionWithProgress>
	>(new Map());
	const [bookmark, setBookmark] = useState<ReaderBookmark | undefined>(
		undefined,
	);
	const [isBookmarkScreen, setIsBookmarkScreen] = useState(false);
	const [pdfDocumentPageCount, setPdfDocumentPageCount] = useState<
		number | null
	>(null);
	const [readerApiRevision, setReaderApiRevision] = useState(0);
	const apiRef = useRef<BookReaderApi | null>(null);
	const readerSurfaceRef = useRef<HTMLMainElement | null>(null);
	const livePositionRef = useRef<ReaderBookmark | undefined>(undefined);
	const overlayEntryPositionRef = useRef<ReaderBookmark | undefined>(undefined);
	const initialReadListenSession = readListenPairUuid
		? loadReadListenReaderSession({ pairUuid: readListenPairUuid })
		: undefined;
	const readListenPositionRef = useRef<ReaderBookmark | undefined>(undefined);
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
	// -1 = no report from the reader yet (0 is a real position: book start).
	const exploredRef = useRef(-1);
	const bookCharCountRef = useRef(0);
	const positionClockRef = useRef(0);
	const bookmarkRef = useRef<ReaderBookmark | undefined>(undefined);
	bookmarkRef.current = bookmark;
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
		livePositionRef.current = undefined;
		overlayEntryPositionRef.current = undefined;
		readListenPositionRef.current = undefined;
		readListenPlayheadRef.current = undefined;
	}

	const rememberReadListenPosition = useCallback(
		(position: ReaderBookmark) => {
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
						livePosition: apiRef.current?.getBookmark(),
						exploredCharCount: exploredRef.current,
						rememberedPosition: readListenPositionRef.current,
						savedBookmark: bookmarkRef.current,
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
			livePosition: apiRef.current?.getBookmark(),
			exploredCharCount: exploredRef.current,
			rememberedPosition: readListenPositionRef.current,
			savedBookmark: bookmarkRef.current,
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
					livePosition: apiRef.current?.getBookmark(),
					exploredCharCount: exploredRef.current,
					rememberedPosition: readListenPositionRef.current,
					savedBookmark: bookmarkRef.current,
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

	const loadState = useBookLoader({
		uuid,
		bookTitle,
		cover: book?.cover ?? null,
		serverId: bookServerId,
		fileSizeBytes: book?.filesizeKb ? book.filesizeKb * 1024 : undefined,
		fileName: book?.filename,
		pageCount: book?.pageCount,
		sourceFormat: bookSourceFormat,
		language: book?.languageCode,
		contentForm: book?.contentForm,
		readerSettings: settings,
		onLoaded: ({
			data,
			position,
			bookmark: initialBookmark,
			positionClockAt,
		}) => {
			bookCharCountRef.current = data.characters;
			positionClockRef.current = positionClockAt;
			setBookmark(
				initialBookmark ? saveLocalBookmark(uuid, initialBookmark) : undefined,
			);
			livePositionRef.current =
				position && settingsRef.current.readingPositionMode === "automatic"
					? saveLocalReadingPosition(uuid, position)
					: position;
		},
	});

	const handlePdfDocumentReady = useCallback((pageCount: number) => {
		bookCharCountRef.current = pageCount;
		setPdfDocumentPageCount((current) =>
			current === pageCount ? current : pageCount,
		);
	}, []);

	const getCharCounts = useCallback(() => {
		if (settingsRef.current.readingPositionMode === "automatic") {
			const measuredPosition = apiRef.current?.getBookmark();
			let position = livePositionRef.current;
			if (
				measuredPosition &&
				measuredPosition.exploredCharCount !== position?.exploredCharCount
			) {
				position = measuredPosition;
			}
			if (position) {
				position = saveLocalReadingPosition(uuid, position);
				livePositionRef.current = position;
				positionClockRef.current = Math.max(
					positionClockRef.current,
					position.lastBookmarkModified,
				);
			}
			return {
				exploredCharCount: position?.exploredCharCount,
				bookCharCount: bookCharCountRef.current,
				positionMode: position ? ("automatic" as const) : undefined,
				positionIntentAt: position?.lastBookmarkModified,
			};
		}

		return {
			exploredCharCount: bookmarkRef.current?.exploredCharCount,
			bookCharCount: bookCharCountRef.current,
			positionMode: bookmarkRef.current ? ("bookmark" as const) : undefined,
			positionIntentAt: bookmarkRef.current?.lastBookmarkModified,
		};
	}, [uuid]);

	const { syncNow } = useReaderSync({
		bookUuid: uuid,
		activePositionMode: settings.readingPositionMode,
		positionClockAt: positionClockRef.current,
		enabled:
			loadState.phase === "ready" &&
			(!isPdfBook || pdfDocumentPageCount !== null) &&
			bookCharCountRef.current > 0,
		getCharCounts,
	});

	const bookmarkPage = useCallback(() => {
		// Count 0 (the very start of the book) is a valid bookmark position.
		const data = apiRef.current?.getBookmark();
		if (!data) return;
		const savedBookmark = saveLocalBookmark(uuid, {
			...data,
			lastBookmarkModified: Math.max(
				data.lastBookmarkModified,
				positionClockRef.current + 1,
			),
		});
		positionClockRef.current = Math.max(
			positionClockRef.current,
			savedBookmark.lastBookmarkModified,
		);
		setBookmark(savedBookmark);
		apiRef.current?.showBookmarkMarker(savedBookmark);
		setIsBookmarkScreen(true);
	}, [uuid]);

	const handleExploredChange = (count: number) => {
		if (count === exploredRef.current) return;
		exploredRef.current = count;
		const position = {
			exploredCharCount: count,
			progress: bookCharCountRef.current ? count / bookCharCountRef.current : 0,
			lastBookmarkModified: Math.max(Date.now(), positionClockRef.current + 1),
		};
		positionClockRef.current = Math.max(
			positionClockRef.current,
			position.lastBookmarkModified,
		);
		livePositionRef.current = position;
		// Quick Settings is deliberately non-modal so the navbar remains usable.
		// If the reader is also moved behind the sheet, that genuine reading input
		// becomes the new reflow anchor instead of snapping to the opening point.
		if (quickSettingsOpen) overlayEntryPositionRef.current = position;
		setExploredCharCount(count);
		setIsBookmarkScreen(
			!!bookmarkRef.current && bookmarkRef.current.exploredCharCount === count,
		);
	};

	const captureReaderPosition = () => {
		const position = apiRef.current?.getBookmark();
		if (!position) return livePositionRef.current;
		livePositionRef.current = position;
		exploredRef.current = position.exploredCharCount;
		setExploredCharCount(position.exploredCharCount);
		return position;
	};

	// Direct commit path, used by keybinds while the overlay is closed
	// (autoscroll speed) — these never touch the book layout.
	const handleSettingsChange = (patch: Partial<ReaderSettings>) => {
		const next = { ...settings, ...patch };
		const resumeModeChanged =
			next.readingPositionMode !== settings.readingPositionMode;
		settingsRef.current = next;
		setSettings(next);
		setProfilesStore(
			commitProfilesStore(
				setProfileSettings(profilesStore, activeProfileId, next),
			),
		);
		if (resumeModeChanged) void syncNow();
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

	const handleMangaSettingsChange = (patch: Partial<MangaReaderSettings>) => {
		setMangaSettings((current) => {
			const next = { ...current, ...patch };
			saveMangaReaderSettings(next);
			return next;
		});
	};

	const handlePresentationChange = (change: ReaderPresentationChange) => {
		// Capture a mode-neutral position before the active engine unmounts. Every
		// engine maps exploredCharCount onto the same normalized section sequence.
		const currentPosition =
			captureReaderPosition() ?? overlayEntryPositionRef.current;
		if (currentPosition) {
			livePositionRef.current = currentPosition;
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
		apiRef.current?.setScrollbarHidden?.(true);
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
		apiRef.current?.setScrollbarHidden?.(false);
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
		position?: ReaderBookmark,
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

		const resumeModeChanged =
			next.readingPositionMode !== settings.readingPositionMode;
		restoreDocumentScrollbar(next.theme);
		settingsRef.current = next;
		setSettings(next);
		setProfilesStore(
			commitProfilesStore(
				setProfileSettings(profilesStore, activeProfileId, next),
			),
		);
		if (position) livePositionRef.current = position;
		applyCommittedSettings(next, settings, position);
		overlayEntryPositionRef.current = undefined;
		if (resumeModeChanged) void syncNow();
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
		if (next.readingPositionMode !== prev.readingPositionMode) void syncNow();
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
		comicLayout: mangaSettings.layout,
	});
	const isComic = presentation.engine === "comic";
	const isPdf = presentation.engine === "pdf";
	const comicDirection =
		isComic && loadState.phase === "ready"
			? resolveMangaReadingDirection(
					mangaSettings.readingDirection,
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
		bookmarkRef,
		presentation,
		verticalMode,
		comicDirection,
		autoScrollMultiplier: settings.autoScrollMultiplier,
		galleryOpen,
		tocOpen,
		settingsOpen: settingsOpen || quickSettingsOpen,
		navigationBlocked: Boolean(audioPlayerBook) && isAudioPlayerExpanded,
		onBookmark: bookmarkPage,
		onCloseToc: () => setTocOpen(false),
		onCloseSettings: () => {
			if (quickSettingsOpen) closeQuickSettings();
			else closeSettings();
		},
		onChangeChapter: changeChapter,
		onAutoScrollMultiplierChange: (next) => {
			handleSettingsChange({ autoScrollMultiplier: next });
			apiRef.current?.setAutoScrollMultiplier?.(next);
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
		livePositionRef.current ??
		(exploredRef.current >= 0
			? {
					exploredCharCount: exploredRef.current,
					progress: data.characters ? exploredRef.current / data.characters : 0,
					lastBookmarkModified: positionClockRef.current || Date.now(),
				}
			: loadState.position);

	// Only truly structural settings remount the reader (different component /
	// different scroll axis). Everything else — fonts, sizes, margins, furigana,
	// columns, theme — applies live via re-render + api.relayout(). The reader
	// always renders the committed settings, so draft edits in the overlay
	// never touch it until closeSettings().
	const readerKey = [
		uuid,
		presentation.engine,
		settings.writingMode,
		isComic ? presentation.comicLayout : "",
		(presentation.engine === "text-paginated" ||
			(presentation.engine === "text-scroll" &&
				settings.writingMode === "vertical-rl")) &&
			Boolean(audioPlayerBook),
	].join("|");
	let currentComicPage = 1;
	for (let index = 0; index < data.sections.length; index += 1) {
		if ((data.sections[index]?.startCharacter ?? index) > exploredCharCount)
			break;
		currentComicPage = index + 1;
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
					key={readListenPositionRef.current.lastBookmarkModified}
					position={readListenPositionRef.current}
					stop={stop}
					restore={(position) => {
						const readerApi = apiRef.current;
						if (!readerApi) return;
						exploredRef.current = position.exploredCharCount;
						readerApi.scrollToBookmark(position);
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
					mangaSettings={mangaSettings}
					initialPosition={initialPosition}
					initialBookmark={bookmark}
					onExploredCharCountChange={handleExploredChange}
					onSectionProgressChange={setSectionProgress}
					onToggleChrome={() => setShowHeader((open) => !open)}
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
								controller.setScrollbarHidden?.(true);
							}
						}
					}}
					pdfSource={loadState.pdfSource}
					onPdfDocumentReady={handlePdfDocumentReady}
				/>
			</div>

			{readListenPairUuid &&
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
									livePosition: apiRef.current?.getBookmark(),
									exploredCharCount: exploredRef.current,
									rememberedPosition: readListenPositionRef.current,
									savedBookmark: bookmarkRef.current,
									bookCharCount: bookCharCountRef.current,
								})
							}
							rememberPosition={rememberReadListenPosition}
						/>
					</>
				)}
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
				onOpen={() => setShowHeader(true)}
				theme={theme}
				bookTitle={bookTitle}
				hasChapterData={sectionProgress.size > 0}
				searchAvailable={presentation.engine === "pdf"}
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
				onSearchClick={() => {
					setShowHeader(false);
					apiRef.current?.openSearch?.();
				}}
				onQuickSettingsClick={() => {
					overlayEntryPositionRef.current = captureReaderPosition();
					hideDocumentScrollbar();
					setQuickSettingsOpen(true);
				}}
				readListenAvailable={readListenAvailable}
				readListenActive={Boolean(readListenPairUuid)}
				onReadListenClick={toggleReadListen}
				onExitClick={() => {
					const exit = () =>
						navigate({ to: "/dashboard/books/$uuid", params: { uuid } });
					if (!readListenPairUuid) {
						void exit();
						return;
					}
					void transitionReadListenNavigation({
						direction: "exit",
						update: exit,
					});
				}}
			/>

			<ReaderFooter
				passThrough={isComic || isPdf}
				theme={theme}
				exploredCharCount={exploredCharCount}
				bookCharCount={data.characters}
				showCharacterCounter={settings.showCharacterCounter}
				showPercentage={settings.showPercentage}
				reservePlayerSpace={Boolean(audioPlayerBook)}
				comicProgress={
					isComic || isPdf
						? {
								currentPage: currentComicPage,
								pageCount: data.sections.length,
								style: mangaSettings.progressStyle,
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
					onNavigate={(reference) =>
						apiRef.current?.navigateToSection(reference)
					}
					onClose={() => setTocOpen(false)}
				/>
			)}

			<ReaderQuickSettings
				open={quickSettingsOpen}
				presentation={presentation}
				mangaSettings={mangaSettings}
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
				onMangaSettingsChange={handleMangaSettingsChange}
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
					currentBookUuid={uuid}
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
