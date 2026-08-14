import type { ReaderBookmark } from "@/lib/reader/types";

export type DisableReadListenReaderOptions = {
	getCurrentPosition: () => ReaderBookmark | undefined;
	rememberPosition: (position: ReaderBookmark) => void;
	leaveMode: () => Promise<void>;
};

export type ResolveReadListenReaderPositionOptions = {
	livePosition: ReaderBookmark | undefined;
	exploredCharCount: number;
	rememberedPosition: ReaderBookmark | undefined;
	rememberedPlayheadSeconds?: number;
	currentPlayheadSeconds?: number;
	savedBookmark: ReaderBookmark | undefined;
	bookCharCount: number;
};

export type ReadListenReaderSessionStorage = Pick<
	Storage,
	"getItem" | "setItem"
>;

export type ReadListenReaderSession = {
	version: 1;
	pairUuid: string;
	ebookUuid: string;
	audiobookUuid: string;
	originHref: string;
	originHistoryIndex: number;
	entryPlayheadSeconds: number;
	position?: ReaderBookmark;
	positionPlayheadSeconds?: number;
};

export type ReadListenReaderExitPlan =
	| { type: "back" }
	| { type: "navigate"; href: string };

const SESSION_VERSION = 1;
const PLAYHEAD_RESUME_TOLERANCE_SECONDS = 1;
const sessionKey = (pairUuid: string) =>
	`nanahoshi-read-listen-reader:${pairUuid}`;

function browserSessionStorage(): ReadListenReaderSessionStorage | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		return window.sessionStorage;
	} catch {
		return undefined;
	}
}

function validNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function validBookmark(value: unknown): value is ReaderBookmark {
	if (!value || typeof value !== "object") return false;
	const bookmark = value as Partial<ReaderBookmark>;
	return (
		validNumber(bookmark.exploredCharCount) &&
		validNumber(bookmark.progress) &&
		validNumber(bookmark.lastBookmarkModified)
	);
}

export function loadReadListenReaderSession({
	pairUuid,
	storage = browserSessionStorage(),
}: {
	pairUuid: string;
	storage?: ReadListenReaderSessionStorage;
}): ReadListenReaderSession | undefined {
	if (!storage) return undefined;
	try {
		const raw = storage.getItem(sessionKey(pairUuid));
		if (!raw) return undefined;
		const value = JSON.parse(raw) as Partial<ReadListenReaderSession>;
		if (
			value.version !== SESSION_VERSION ||
			value.pairUuid !== pairUuid ||
			typeof value.ebookUuid !== "string" ||
			typeof value.audiobookUuid !== "string" ||
			typeof value.originHref !== "string" ||
			!validNumber(value.originHistoryIndex) ||
			!validNumber(value.entryPlayheadSeconds) ||
			(value.position !== undefined && !validBookmark(value.position)) ||
			(value.positionPlayheadSeconds !== undefined &&
				!validNumber(value.positionPlayheadSeconds))
		) {
			return undefined;
		}
		return value as ReadListenReaderSession;
	} catch {
		return undefined;
	}
}

export function rememberReadListenReaderEntry({
	pairUuid,
	ebookUuid,
	audiobookUuid,
	originHref,
	originHistoryIndex,
	playheadSeconds,
	storage = browserSessionStorage(),
}: {
	pairUuid: string;
	ebookUuid: string;
	audiobookUuid: string;
	originHref: string;
	originHistoryIndex: number;
	playheadSeconds: number;
	storage?: ReadListenReaderSessionStorage;
}) {
	if (!storage) return;
	const previous = loadReadListenReaderSession({ pairUuid, storage });
	const next: ReadListenReaderSession = {
		version: SESSION_VERSION,
		pairUuid,
		ebookUuid,
		audiobookUuid,
		originHref,
		originHistoryIndex,
		entryPlayheadSeconds: playheadSeconds,
		...(previous?.position ? { position: previous.position } : {}),
		...(previous?.positionPlayheadSeconds !== undefined
			? { positionPlayheadSeconds: previous.positionPlayheadSeconds }
			: {}),
	};
	try {
		storage.setItem(sessionKey(pairUuid), JSON.stringify(next));
	} catch {
		// Private browsing or a full quota must not block reader navigation.
	}
}

export function rememberReadListenReaderPosition({
	pairUuid,
	position,
	playheadSeconds,
	storage = browserSessionStorage(),
}: {
	pairUuid: string;
	position: ReaderBookmark;
	playheadSeconds: number;
	storage?: ReadListenReaderSessionStorage;
}) {
	if (!storage) return;
	const current = loadReadListenReaderSession({ pairUuid, storage });
	if (!current) return;
	try {
		storage.setItem(
			sessionKey(pairUuid),
			JSON.stringify({
				...current,
				position,
				positionPlayheadSeconds: playheadSeconds,
			} satisfies ReadListenReaderSession),
		);
	} catch {
		// Session continuity is an enhancement; the live reader still works.
	}
}

function safeOriginHref(href: string | undefined): string | undefined {
	if (!href?.startsWith("/") || href.startsWith("//")) return undefined;
	try {
		const url = new URL(href, "https://nanahoshi.invalid");
		if (/^\/(?:[a-z]{2}\/)?reader(?:\/|$)/u.test(url.pathname)) {
			return undefined;
		}
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return undefined;
	}
}

export function planReadListenReaderExit({
	session,
	currentHistoryIndex,
	fallbackAudiobookUuid,
	fallbackEbookUuid,
}: {
	session?: ReadListenReaderSession;
	currentHistoryIndex?: number;
	fallbackAudiobookUuid?: string;
	fallbackEbookUuid?: string;
}): ReadListenReaderExitPlan {
	if (session && currentHistoryIndex === session.originHistoryIndex + 1) {
		return { type: "back" };
	}
	const originHref = safeOriginHref(session?.originHref);
	if (originHref) return { type: "navigate", href: originHref };
	const audiobookUuid = fallbackAudiobookUuid ?? session?.audiobookUuid;
	if (audiobookUuid) {
		return {
			type: "navigate",
			href: `/dashboard/audiobooks/${encodeURIComponent(audiobookUuid)}`,
		};
	}
	return {
		type: "navigate",
		href: `/dashboard/books/${encodeURIComponent(
			fallbackEbookUuid ?? session?.ebookUuid ?? "",
		)}`,
	};
}

type ReadListenReaderNavigate = (options: {
	to: "/reader/$uuid";
	params: { uuid: string };
	search: { pair: string } | Record<string, never>;
	replace: true;
	resetScroll: false;
}) => void | Promise<void>;

type OpenReadListenReaderNavigate = (options: {
	to: "/reader/$uuid";
	params: { uuid: string };
	search: { pair: string };
}) => void | Promise<void>;

/** Enters the synchronized reader without changing or recreating playback. */
export async function navigateToReadListenReader({
	navigate,
	ebookUuid,
	pairUuid,
}: {
	navigate: OpenReadListenReaderNavigate;
	ebookUuid: string;
	pairUuid: string;
}): Promise<void> {
	await navigate({
		to: "/reader/$uuid",
		params: { uuid: ebookUuid },
		search: { pair: pairUuid },
	});
}

export async function navigateReadListenReaderMode({
	navigate,
	uuid,
	pairUuid,
}: {
	navigate: ReadListenReaderNavigate;
	uuid: string;
	pairUuid?: string;
}): Promise<void> {
	await navigate({
		to: "/reader/$uuid",
		params: { uuid },
		search: pairUuid ? { pair: pairUuid } : {},
		replace: true,
		resetScroll: false,
	});
}

export function resolveReadListenReaderPosition({
	livePosition,
	exploredCharCount,
	rememberedPosition,
	rememberedPlayheadSeconds,
	currentPlayheadSeconds,
	savedBookmark,
	bookCharCount,
}: ResolveReadListenReaderPositionOptions): ReaderBookmark | undefined {
	if (livePosition) return livePosition;
	if (exploredCharCount >= 0) {
		return {
			exploredCharCount,
			progress: bookCharCount ? exploredCharCount / bookCharCount : 0,
			lastBookmarkModified: Date.now(),
		};
	}
	if (
		rememberedPosition &&
		rememberedPlayheadSeconds !== undefined &&
		currentPlayheadSeconds !== undefined &&
		Math.abs(currentPlayheadSeconds - rememberedPlayheadSeconds) >
			PLAYHEAD_RESUME_TOLERANCE_SECONDS
	) {
		return savedBookmark;
	}
	return rememberedPosition ?? savedBookmark;
}

export async function disableReadListenReader({
	getCurrentPosition,
	rememberPosition,
	leaveMode,
}: DisableReadListenReaderOptions): Promise<void> {
	const position = getCurrentPosition();
	if (position) rememberPosition(position);
	await leaveMode();
}
