import {
	type KeyboardEvent,
	type PointerEvent,
	type RefObject,
	useCallback,
	useEffect,
	useRef,
} from "react";

export interface FloatingWindowOffset {
	x: number;
	y: number;
}

export interface FloatingWindowSize {
	width: number;
	height: number;
}

type FloatingWindowBounds = Pick<DOMRect, "bottom" | "left" | "right" | "top">;

const clampOffset = (value: number, min: number, max: number) =>
	min > max ? min : Math.min(Math.max(value, min), max);

export function constrainFloatingWindowOffset(
	next: FloatingWindowOffset,
	current: FloatingWindowOffset,
	bounds: FloatingWindowBounds,
	viewport: { width: number; height: number },
	inset = 16,
): FloatingWindowOffset {
	const baseLeft = bounds.left - current.x;
	const baseRight = bounds.right - current.x;
	const baseTop = bounds.top - current.y;
	const baseBottom = bounds.bottom - current.y;
	const minX = inset - baseLeft;
	const maxX = viewport.width - inset - baseRight;
	const minY = inset - baseTop;
	const maxY = viewport.height - inset - baseBottom;
	return {
		x: clampOffset(next.x, minX, maxX),
		y: clampOffset(next.y, minY, maxY),
	};
}

const getViewport = () => ({
	width: document.documentElement.clientWidth || window.innerWidth,
	height: document.documentElement.clientHeight || window.innerHeight,
});

export function useFloatingWindowDrag<T extends HTMLElement>({
	enabled = true,
	inset = 16,
	keyboardStep = 8,
	viewport = getViewport,
}: {
	enabled?: boolean;
	inset?: number;
	keyboardStep?: number;
	viewport?: () => { width: number; height: number };
} = {}) {
	const surfaceRef = useRef<T>(null);
	const offsetRef = useRef<FloatingWindowOffset>({ x: 0, y: 0 });
	const dragRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		startOffset: FloatingWindowOffset;
		minX: number;
		maxX: number;
		minY: number;
		maxY: number;
	} | null>(null);

	const applyOffset = useCallback((next: FloatingWindowOffset) => {
		offsetRef.current = next;
		if (surfaceRef.current) {
			surfaceRef.current.style.transform = `translate3d(calc(-50% + ${next.x}px), calc(-50% + ${next.y}px), 0)`;
		}
	}, []);

	const constrain = useCallback(
		(next: FloatingWindowOffset) => {
			const surface = surfaceRef.current;
			if (!surface) return next;
			return constrainFloatingWindowOffset(
				next,
				offsetRef.current,
				surface.getBoundingClientRect(),
				viewport(),
				inset,
			);
		},
		[inset, viewport],
	);

	useEffect(() => {
		if (!enabled) return;
		const keepInViewport = () => applyOffset(constrain(offsetRef.current));
		window.addEventListener("resize", keepInViewport);
		return () => window.removeEventListener("resize", keepInViewport);
	}, [applyOffset, constrain, enabled]);

	const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
		if (!enabled || !event.isPrimary || event.button !== 0) return;
		const surface = surfaceRef.current;
		if (!surface) return;
		const current = offsetRef.current;
		const bounds = surface.getBoundingClientRect();
		const size = viewport();
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			startOffset: current,
			minX: inset - (bounds.left - current.x),
			maxX: size.width - inset - (bounds.right - current.x),
			minY: inset - (bounds.top - current.y),
			maxY: size.height - inset - (bounds.bottom - current.y),
		};
	};
	const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		event.preventDefault();
		applyOffset({
			x: clampOffset(
				drag.startOffset.x + event.clientX - drag.startX,
				drag.minX,
				drag.maxX,
			),
			y: clampOffset(
				drag.startOffset.y + event.clientY - drag.startY,
				drag.minY,
				drag.maxY,
			),
		});
	};
	const onPointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
		if (dragRef.current?.pointerId !== event.pointerId) return;
		dragRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};
	const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		const direction = {
			ArrowDown: { x: 0, y: 1 },
			ArrowLeft: { x: -1, y: 0 },
			ArrowRight: { x: 1, y: 0 },
			ArrowUp: { x: 0, y: -1 },
		}[event.key];
		if (event.key === "Home") {
			event.preventDefault();
			applyOffset({ x: 0, y: 0 });
			return;
		}
		if (!enabled || !direction) return;
		event.preventDefault();
		const step = event.shiftKey ? keyboardStep * 4 : keyboardStep;
		applyOffset(
			constrain({
				x: offsetRef.current.x + direction.x * step,
				y: offsetRef.current.y + direction.y * step,
			}),
		);
	};
	const cancelDrag = useCallback(() => {
		dragRef.current = null;
	}, []);

	return {
		surfaceRef,
		offsetRef,
		applyOffset,
		cancelDrag,
		dragHandleProps: {
			onKeyDown,
			onPointerDown,
			onPointerMove,
			onPointerUp: onPointerEnd,
			onPointerCancel: onPointerEnd,
		},
	};
}

export function useFloatingWindowResize<T extends HTMLElement>({
	surfaceRef,
	offsetRef,
	applyOffset,
	enabled = true,
	inset = 16,
	keyboardStep = 8,
	minWidth = 320,
	minHeight = 320,
	viewport = getViewport,
}: {
	surfaceRef: RefObject<T | null>;
	offsetRef: RefObject<FloatingWindowOffset>;
	applyOffset: (next: FloatingWindowOffset) => void;
	enabled?: boolean;
	inset?: number;
	keyboardStep?: number;
	minWidth?: number;
	minHeight?: number;
	viewport?: () => { width: number; height: number };
}) {
	const sizeRef = useRef<FloatingWindowSize | null>(null);
	const expandedSizeRef = useRef<FloatingWindowSize | null>(null);
	const resizeRef = useRef<{
		pointerId: number;
		startX: number;
		startY: number;
		startOffset: FloatingWindowOffset;
		startSize: FloatingWindowSize;
		maxWidth: number;
		maxHeight: number;
	} | null>(null);

	const applyGeometry = useCallback(
		(nextOffset: FloatingWindowOffset, nextSize: FloatingWindowSize) => {
			sizeRef.current = nextSize;
			if (surfaceRef.current) {
				surfaceRef.current.style.width = `${nextSize.width}px`;
				surfaceRef.current.style.height = `${nextSize.height}px`;
			}
			applyOffset(nextOffset);
		},
		[applyOffset, surfaceRef],
	);

	const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
		if (!enabled || !event.isPrimary || event.button !== 0) return;
		const surface = surfaceRef.current;
		if (!surface) return;
		const bounds = surface.getBoundingClientRect();
		const size = viewport();
		event.currentTarget.setPointerCapture(event.pointerId);
		resizeRef.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startY: event.clientY,
			startOffset: offsetRef.current,
			startSize: { width: bounds.width, height: bounds.height },
			maxWidth: size.width - inset - bounds.left,
			maxHeight: size.height - inset - bounds.top,
		};
	};
	const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
		const resize = resizeRef.current;
		if (!resize || resize.pointerId !== event.pointerId) return;
		event.preventDefault();
		const nextSize = {
			width: Math.min(
				Math.max(
					resize.startSize.width + event.clientX - resize.startX,
					minWidth,
				),
				Math.max(minWidth, resize.maxWidth),
			),
			height: Math.min(
				Math.max(
					resize.startSize.height + event.clientY - resize.startY,
					minHeight,
				),
				Math.max(minHeight, resize.maxHeight),
			),
		};
		expandedSizeRef.current = nextSize;
		applyGeometry(
			{
				x: resize.startOffset.x + (nextSize.width - resize.startSize.width) / 2,
				y:
					resize.startOffset.y +
					(nextSize.height - resize.startSize.height) / 2,
			},
			nextSize,
		);
	};
	const onPointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
		if (resizeRef.current?.pointerId !== event.pointerId) return;
		resizeRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};
	const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
		const direction = {
			ArrowDown: { width: 0, height: 1 },
			ArrowLeft: { width: -1, height: 0 },
			ArrowRight: { width: 1, height: 0 },
			ArrowUp: { width: 0, height: -1 },
		}[event.key];
		if (!enabled || !direction || !surfaceRef.current) return;
		event.preventDefault();
		const bounds = surfaceRef.current.getBoundingClientRect();
		const step = event.shiftKey ? keyboardStep * 4 : keyboardStep;
		const size = viewport();
		const currentSize = { width: bounds.width, height: bounds.height };
		const nextSize = {
			width: Math.min(
				Math.max(currentSize.width + direction.width * step, minWidth),
				Math.max(
					minWidth,
					currentSize.width + size.width - inset - bounds.right,
				),
			),
			height: Math.min(
				Math.max(currentSize.height + direction.height * step, minHeight),
				Math.max(
					minHeight,
					currentSize.height + size.height - inset - bounds.bottom,
				),
			),
		};
		expandedSizeRef.current = nextSize;
		applyGeometry(
			{
				x: offsetRef.current.x + (nextSize.width - currentSize.width) / 2,
				y: offsetRef.current.y + (nextSize.height - currentSize.height) / 2,
			},
			nextSize,
		);
	};
	const resetResize = useCallback(() => {
		resizeRef.current = null;
		sizeRef.current = null;
		expandedSizeRef.current = null;
	}, []);

	return {
		sizeRef,
		expandedSizeRef,
		applyGeometry,
		resetResize,
		resizeHandleProps: {
			onKeyDown,
			onPointerDown,
			onPointerMove,
			onPointerUp: onPointerEnd,
			onPointerCancel: onPointerEnd,
		},
	};
}
