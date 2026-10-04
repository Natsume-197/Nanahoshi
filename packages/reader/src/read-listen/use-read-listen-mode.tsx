import { useMountEffect } from "@nanahoshi/ui/hooks/use-mount-effect";
import { useRef } from "react";
import type { ReaderPosition } from "../document/types";
import type { ReaderRuntime, ReadListenExtension } from "../reader-extensions";
import { ReadListenRuntime } from "./read-listen-runtime";
import {
	disableReadListenReader,
	loadReadListenReaderSession,
	rememberReadListenReaderPosition,
	resolveReadListenReaderPosition,
} from "./reader-session";

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

const livePosition = (runtime: ReaderRuntime, remembered?: ReaderPosition) =>
	resolveReadListenReaderPosition({
		livePosition: runtime.apiRef.current?.getPosition(),
		exploredCharCount: runtime.exploredRef.current,
		rememberedPosition: remembered,
		bookCharCount: runtime.bookCharCountRef.current,
	});

/**
 * Read & Listen mode in the reader: pairing toggle, audio sync, restoring the
 * text position on the way out. The host owns where the mode lives (the web's
 * URL, the phone's screen state), so switching it goes through these callbacks.
 */
export function useReadListenMode({
	uuid,
	pairUuid,
	readyPairUuid,
	available,
	stopAudio,
	enterMode,
	leaveMode,
	exitReadListen,
}: {
	uuid: string;
	pairUuid: string | undefined;
	readyPairUuid: string | undefined;
	available: boolean;
	stopAudio: () => void;
	enterMode: (pairUuid: string) => void | Promise<void>;
	/** Back to plain reading, staying in the reader. */
	leaveMode: () => void | Promise<void>;
	/** The player's "exit Read & Listen": may leave the reader altogether. */
	exitReadListen: () => void | Promise<void>;
}): ReadListenExtension & { clearEntry: () => void } {
	const initialSession = pairUuid
		? loadReadListenReaderSession({ pairUuid })
		: undefined;
	const positionRef = useRef<ReaderPosition | undefined>(undefined);
	// Only the reader's own mode toggle may make text authoritative on entry.
	// Positions remembered for exit/restoration must never seek an audiobook.
	const entryCharacterRef = useRef<number | undefined>(undefined);
	const playheadRef = useRef<number | undefined>(
		initialSession?.positionPlayheadSeconds,
	);
	const loadedPairRef = useRef(pairUuid);
	if (pairUuid && pairUuid !== loadedPairRef.current) {
		loadedPairRef.current = pairUuid;
		const session = loadReadListenReaderSession({ pairUuid });
		positionRef.current = undefined;
		playheadRef.current = session?.positionPlayheadSeconds;
	}
	const previousUuidRef = useRef(uuid);
	if (uuid !== previousUuidRef.current) {
		previousUuidRef.current = uuid;
		positionRef.current = undefined;
		entryCharacterRef.current = undefined;
		playheadRef.current = undefined;
	}

	const rememberPosition = (
		runtime: ReaderRuntime,
		position: ReaderPosition,
	) => {
		positionRef.current = position;
		runtime.exploredRef.current = position.exploredCharCount;
		if (pairUuid && playheadRef.current !== undefined) {
			rememberReadListenReaderPosition({
				pairUuid,
				position,
				playheadSeconds: playheadRef.current,
			});
		}
	};

	const toggle = (runtime: ReaderRuntime) => {
		if (pairUuid) {
			entryCharacterRef.current = undefined;
			void disableReadListenReader({
				getCurrentPosition: () => livePosition(runtime, positionRef.current),
				rememberPosition: (position) => rememberPosition(runtime, position),
				leaveMode: async () => {
					await leaveMode();
				},
			});
			return;
		}
		if (!readyPairUuid) return;
		const position = livePosition(runtime, positionRef.current);
		if (position) {
			positionRef.current = position;
			entryCharacterRef.current = position.exploredCharCount;
		}
		void enterMode(readyPairUuid);
	};

	const exit = (runtime: ReaderRuntime) => {
		entryCharacterRef.current = undefined;
		void disableReadListenReader({
			getCurrentPosition: () => livePosition(runtime, positionRef.current),
			rememberPosition: (position) => rememberPosition(runtime, position),
			leaveMode: async () => {
				await exitReadListen();
			},
		});
	};

	return {
		active: Boolean(pairUuid),
		available,
		toggle,
		clearEntry: () => {
			entryCharacterRef.current = undefined;
		},
		render: ({
			runtime,
			sections,
			sourceFormat,
			lazyBook,
			domRevision,
			pauseAudioAfterLine,
			theme,
		}) => {
			if (!pairUuid) {
				const remembered = positionRef.current;
				return remembered ? (
					<RestoreReadListenPosition
						key={remembered.modifiedAt}
						position={remembered}
						stop={stopAudio}
						restore={(position) => {
							const readerApi = runtime.apiRef.current;
							if (!readerApi) return;
							runtime.exploredRef.current = position.exploredCharCount;
							readerApi.scrollToPosition(position);
						}}
					/>
				) : null;
			}
			if (lazyBook || !sourceFormat || sourceFormat === "pdf") return null;
			const entryCharacter = entryCharacterRef.current;
			return (
				<>
					<ReadListenRuntime
						key={`${pairUuid}:${entryCharacter ?? "audio"}`}
						pairUuid={pairUuid}
						ebookUuid={uuid}
						sourceFormat={sourceFormat}
						readerApiRef={runtime.apiRef}
						readerSurfaceRef={runtime.surfaceRef}
						sections={sections}
						initialTextPosition={entryCharacter}
						readerDomRevision={domRevision}
						playheadRef={playheadRef}
						pauseAudioAfterLine={pauseAudioAfterLine}
						theme={theme}
						onExitReadListen={() => exit(runtime)}
					/>
					<PersistReadListenPositionOnExit
						key={`persist:${pairUuid}`}
						getCurrentPosition={() =>
							livePosition(runtime, positionRef.current)
						}
						rememberPosition={(position) => rememberPosition(runtime, position)}
					/>
				</>
			);
		},
	};
}
