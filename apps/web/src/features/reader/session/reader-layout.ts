import { useRef } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

/** The transaction clock and surface observer for a renderer reflow. */
export interface ReaderLayoutSchedulerClock {
	schedule(callback: () => void, delay: number): unknown;
	cancel(handle: unknown): void;
}

const browserClock: ReaderLayoutSchedulerClock = {
	schedule: (callback, delay) => setTimeout(callback, delay),
	cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface ReaderLayoutTransaction {
	isCurrent(): boolean;
}

interface CreateReaderLayoutSchedulerOptions {
	run: (transaction: ReaderLayoutTransaction) => void;
	delayMs?: number;
	clock?: ReaderLayoutSchedulerClock;
}

export interface ReaderLayoutScheduler {
	request(): void;
	cancel(): void;
}

export function createReaderLayoutScheduler({
	run,
	delayMs = 100,
	clock = browserClock,
}: CreateReaderLayoutSchedulerOptions): ReaderLayoutScheduler {
	let handle: unknown;
	let revision = 0;
	return {
		request() {
			const transactionRevision = ++revision;
			if (handle !== undefined) clock.cancel(handle);
			handle = clock.schedule(() => {
				handle = undefined;
				run({ isCurrent: () => transactionRevision === revision });
			}, delayMs);
		},
		cancel() {
			revision += 1;
			if (handle === undefined) return;
			clock.cancel(handle);
			handle = undefined;
		},
	};
}

/** Watches the reading surface, including changes that are not window resizes. */
export function useReaderSurfaceResize(
	getSurface: () => Element | null,
	onResize: () => void,
) {
	const getSurfaceRef = useRef(getSurface);
	getSurfaceRef.current = getSurface;
	const onResizeRef = useRef(onResize);
	onResizeRef.current = onResize;
	useMountEffect(() => {
		if (typeof ResizeObserver === "undefined") return;
		const surface = getSurfaceRef.current();
		if (!surface) return;
		let frame: ReturnType<typeof requestAnimationFrame> | undefined;
		const observer = new ResizeObserver(() => {
			if (frame !== undefined) cancelAnimationFrame(frame);
			frame = requestAnimationFrame(() => {
				frame = undefined;
				onResizeRef.current();
			});
		});
		observer.observe(surface);
		return () => {
			if (frame !== undefined) cancelAnimationFrame(frame);
			observer.disconnect();
		};
	});
}
