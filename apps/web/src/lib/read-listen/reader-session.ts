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
	savedBookmark: ReaderBookmark | undefined;
	bookCharCount: number;
};

type ReadListenReaderNavigate = (options: {
	to: "/reader/$uuid";
	params: { uuid: string };
	search: { pair: string } | Record<string, never>;
	replace: true;
	resetScroll: false;
}) => void | Promise<void>;

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
