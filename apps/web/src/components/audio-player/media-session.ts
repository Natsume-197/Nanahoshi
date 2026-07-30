import { getCoverFilename, getCoverUrl } from "@/utils/covers";

// Server resize buckets (see covers route); off-bucket widths get snapped.
const ARTWORK_WIDTHS = [300, 600] as const;

function session(): MediaSession | null {
	if (typeof navigator === "undefined") return null;
	return "mediaSession" in navigator ? navigator.mediaSession : null;
}

function buildArtwork(cover: string | null): MediaImage[] | undefined {
	const filename = getCoverFilename(cover);
	if (!filename) return undefined;
	return ARTWORK_WIDTHS.map((width) => ({
		src: getCoverUrl(filename, width),
		sizes: `${width}x${width}`,
		type: "image/avif",
	}));
}

export function setMediaSessionMetadata(book: {
	title: string;
	artist: string;
	album: string;
	cover: string | null;
}) {
	const ms = session();
	if (!ms || typeof MediaMetadata === "undefined") return;
	ms.metadata = new MediaMetadata({
		title: book.title,
		artist: book.artist,
		album: book.album,
		artwork: buildArtwork(book.cover),
	});
}

export function clearMediaSession() {
	const ms = session();
	if (!ms) return;
	ms.metadata = null;
	ms.playbackState = "none";
}

export function setMediaSessionPlaybackState(state: MediaSessionPlaybackState) {
	const ms = session();
	if (ms) ms.playbackState = state;
}

export function setMediaSessionPosition(position: {
	duration: number;
	position: number;
	playbackRate: number;
}) {
	const ms = session();
	if (!ms?.setPositionState) return;
	// The spec rejects a non-finite duration, which happens while a multi-file
	// book swaps src.
	if (!Number.isFinite(position.duration) || position.duration <= 0) return;
	try {
		ms.setPositionState({
			duration: position.duration,
			position: Math.max(0, Math.min(position.position, position.duration)),
			playbackRate: Math.max(0.1, position.playbackRate),
		});
	} catch {
		// Stale position during a src swap.
	}
}

export interface MediaSessionHandlers {
	play: () => void;
	pause: () => void;
	stop: () => void;
	seekBackward: (offset?: number) => void;
	seekForward: (offset?: number) => void;
	seekTo: (time: number) => void;
	previousChapter: () => void;
	nextChapter: () => void;
}

export function registerMediaSessionHandlers(
	handlers: MediaSessionHandlers,
): () => void {
	const ms = session();
	if (!ms?.setActionHandler) return () => {};

	const bindings: [MediaSessionAction, MediaSessionActionHandler][] = [
		["play", () => handlers.play()],
		["pause", () => handlers.pause()],
		["stop", () => handlers.stop()],
		["seekbackward", (details) => handlers.seekBackward(details.seekOffset)],
		["seekforward", (details) => handlers.seekForward(details.seekOffset)],
		[
			"seekto",
			(details) => {
				if (details.seekTime != null) handlers.seekTo(details.seekTime);
			},
		],
		["previoustrack", () => handlers.previousChapter()],
		["nexttrack", () => handlers.nextChapter()],
	];

	for (const [action, handler] of bindings) {
		try {
			ms.setActionHandler(action, handler);
		} catch {
			// Unsupported action on this browser.
		}
	}

	return () => {
		for (const [action] of bindings) {
			try {
				ms.setActionHandler(action, null);
			} catch {
				// Nothing to unbind.
			}
		}
	};
}
