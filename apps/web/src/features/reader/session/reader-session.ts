import { useCallback, useEffect, useRef, useState } from "react";
import {
	READER_POSITION_VERSION,
	type ReaderPosition,
} from "@/features/reader/document/types";

export interface ReaderPositionSaveScheduler {
	schedule(callback: () => void, delay: number): unknown;
	cancel(handle: unknown): void;
}

interface ReaderPositionSaverOptions<TPosition> {
	read: () => TPosition | undefined;
	write: (position: TPosition) => void;
	delayMs?: number;
	scheduler?: ReaderPositionSaveScheduler;
}

export interface ReaderPositionSaver {
	schedule(): void;
	flush(): void;
	cancel(): void;
}

const browserScheduler: ReaderPositionSaveScheduler = {
	schedule: (callback, delay) => setTimeout(callback, delay),
	cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export function createReaderPositionSaver<TPosition>({
	read,
	write,
	delayMs = 300,
	scheduler = browserScheduler,
}: ReaderPositionSaverOptions<TPosition>): ReaderPositionSaver {
	let handle: unknown;
	const flush = () => {
		if (handle !== undefined) {
			scheduler.cancel(handle);
			handle = undefined;
		}
		const position = read();
		if (position !== undefined) write(position);
	};
	return {
		schedule() {
			if (handle !== undefined) scheduler.cancel(handle);
			handle = scheduler.schedule(flush, delayMs);
		},
		flush,
		cancel() {
			if (handle === undefined) return;
			scheduler.cancel(handle);
			handle = undefined;
		},
	};
}

const keyFor = (uuid: string) => `nanahoshi-reader-position:${uuid}`;
type StoredPosition = ReaderPosition & { lastBookmarkModified?: number };

export function loadLocalReadingPosition(
	uuid: string,
): ReaderPosition | undefined {
	if (typeof window === "undefined") return undefined;
	try {
		const raw = window.localStorage.getItem(keyFor(uuid));
		if (!raw) return undefined;
		const stored = JSON.parse(raw) as StoredPosition;
		return {
			...stored,
			modifiedAt: stored.modifiedAt ?? stored.lastBookmarkModified ?? 0,
		};
	} catch {
		return undefined;
	}
}

export function saveLocalReadingPosition(
	uuid: string,
	position: ReaderPosition,
): ReaderPosition {
	const previous = loadLocalReadingPosition(uuid);
	if (
		previous?.exploredCharCount === position.exploredCharCount &&
		previous?.locator?.sectionReference ===
			position.locator?.sectionReference &&
		previous?.locator?.characterOffset === position.locator?.characterOffset &&
		previous.modifiedAt >= position.modifiedAt
	) {
		return previous;
	}
	const savedPosition = {
		...position,
		modifiedAt: Math.max(position.modifiedAt, (previous?.modifiedAt ?? -1) + 1),
		positionVersion: READER_POSITION_VERSION,
	};
	try {
		window.localStorage.setItem(keyFor(uuid), JSON.stringify(savedPosition));
	} catch {
		// no-op (private mode, quota...)
	}
	return savedPosition;
}

export interface ReaderSessionSnapshot {
	position: ReaderPosition | undefined;
	exploredCharCount: number;
}

interface ReaderSessionCoordinatorOptions {
	save: (position: ReaderPosition) => void;
	scheduler?: ReaderPositionSaveScheduler;
}

export interface ReaderSessionCoordinator {
	hydrate(position: ReaderPosition | undefined): ReaderSessionSnapshot;
	report(position: ReaderPosition): boolean;
	capture(read: () => ReaderPosition | undefined): ReaderSessionSnapshot;
	snapshot(): ReaderSessionSnapshot;
	reset(): void;
	flush(): void;
	cancel(): void;
}

export function createReaderSessionCoordinator({
	save,
	scheduler,
}: ReaderSessionCoordinatorOptions): ReaderSessionCoordinator {
	let current: ReaderPosition | undefined;
	let lastModifiedAt = 0;
	const saver = createReaderPositionSaver({
		read: () => current,
		write: save,
		scheduler,
	});
	const snapshot = (): ReaderSessionSnapshot => ({
		position: current,
		exploredCharCount: current?.exploredCharCount ?? 0,
	});
	const isSamePosition = (next: ReaderPosition) =>
		next.exploredCharCount === current?.exploredCharCount &&
		next.locator?.sectionReference === current?.locator?.sectionReference &&
		next.locator?.characterOffset === current?.locator?.characterOffset &&
		next.scrollX === current?.scrollX &&
		next.scrollY === current?.scrollY;
	const adopt = (position: ReaderPosition, ensureMonotonic: boolean) => {
		const modifiedAt = ensureMonotonic
			? Math.max(position.modifiedAt, lastModifiedAt + 1)
			: position.modifiedAt;
		current = { ...position, modifiedAt };
		lastModifiedAt = Math.max(lastModifiedAt, modifiedAt);
	};
	const report = (position: ReaderPosition) => {
		if (isSamePosition(position)) return false;
		adopt(position, true);
		saver.schedule();
		return true;
	};
	return {
		hydrate(position) {
			if (!current && position) adopt(position, false);
			return snapshot();
		},
		report,
		capture(read) {
			const position = read();
			if (position) report(position);
			return snapshot();
		},
		snapshot,
		reset() {
			saver.cancel();
			current = undefined;
			lastModifiedAt = 0;
		},
		flush: () => saver.flush(),
		cancel: () => saver.cancel(),
	};
}

/** The screen-facing session interface: one canonical position per book. */
export function useReaderSession(bookUuid: string) {
	const [exploredCharCount, setExploredCharCount] = useState(0);
	const exploredRef = useRef(-1);
	const bookCharCountRef = useRef(0);
	const positionClockRef = useRef(0);
	const readerUuidRef = useRef(bookUuid);
	const readerSessionRef =
		useRef<ReturnType<typeof createReaderSessionCoordinator>>();
	if (!readerSessionRef.current) {
		readerSessionRef.current = createReaderSessionCoordinator({
			save: (position) =>
				saveLocalReadingPosition(readerUuidRef.current, position),
		});
	}
	const previousBookUuidRef = useRef(bookUuid);
	if (bookUuid !== previousBookUuidRef.current) {
		readerSessionRef.current.flush();
		readerSessionRef.current.reset();
		readerUuidRef.current = bookUuid;
		previousBookUuidRef.current = bookUuid;
		exploredRef.current = -1;
		bookCharCountRef.current = 0;
		positionClockRef.current = 0;
		setExploredCharCount(0);
	}
	useEffect(() => () => readerSessionRef.current?.flush(), []);
	const hydrate = useCallback(
		({
			characters,
			position,
			positionClockAt,
		}: {
			characters: number;
			position: ReaderPosition | undefined;
			positionClockAt: number;
		}) => {
			bookCharCountRef.current = characters;
			const restored = readerSessionRef.current?.snapshot().position
				? undefined
				: position && saveLocalReadingPosition(bookUuid, position);
			const restoredState = readerSessionRef.current?.hydrate(restored);
			positionClockRef.current = Math.max(
				positionClockRef.current,
				positionClockAt,
				restoredState?.position?.modifiedAt ?? 0,
			);
			if (restoredState?.position) {
				exploredRef.current = restoredState.exploredCharCount;
				setExploredCharCount(restoredState.exploredCharCount);
			}
		},
		[bookUuid],
	);
	const setBookCharCount = useCallback((count: number) => {
		bookCharCountRef.current = count;
	}, []);
	const reportPosition = useCallback((nextPosition: ReaderPosition) => {
		if (!readerSessionRef.current?.report(nextPosition)) return undefined;
		const position = readerSessionRef.current.snapshot().position;
		if (!position) return undefined;
		exploredRef.current = position.exploredCharCount;
		positionClockRef.current = Math.max(
			positionClockRef.current,
			position.modifiedAt,
		);
		setExploredCharCount(position.exploredCharCount);
		return position;
	}, []);
	const capturePosition = useCallback(
		(readPosition: () => ReaderPosition | undefined) => {
			readerSessionRef.current?.capture(readPosition);
			const position = readerSessionRef.current?.snapshot().position;
			if (position) {
				readerSessionRef.current?.flush();
				positionClockRef.current = Math.max(
					positionClockRef.current,
					position.modifiedAt,
				);
			}
			return position;
		},
		[],
	);
	return {
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
	};
}
