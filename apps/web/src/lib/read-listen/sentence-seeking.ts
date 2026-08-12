import {
	getReadListenPositionIndex,
	installReadListenHoverHighlight,
	type ReadListenAnchorTarget,
	type ReadListenPositionMatch,
} from "./text-anchor";

const INTERACTIVE_SELECTOR =
	'button,a,input,select,textarea,[contenteditable="true"],[role="button"]';

function pointTouchesRenderedCharacter(
	document: Document,
	node: Text,
	offset: number,
	x: number,
	y: number,
): boolean {
	for (const characterOffset of [offset, offset - 1]) {
		const character = node.data[characterOffset];
		if (!character || /\s/u.test(character)) continue;
		const range = document.createRange();
		range.setStart(node, characterOffset);
		range.setEnd(node, characterOffset + 1);
		for (const rect of range.getClientRects()) {
			if (
				x >= rect.left &&
				x <= rect.right &&
				y >= rect.top &&
				y <= rect.bottom
			) {
				return true;
			}
		}
	}
	return false;
}

function caretAtPoint(
	document: Document,
	x: number,
	y: number,
): { node: Text; offset: number } | null {
	const caretDocument = document as Document & {
		caretPositionFromPoint?: (
			x: number,
			y: number,
		) => { offsetNode: Node; offset: number } | null;
		caretRangeFromPoint?: (x: number, y: number) => Range | null;
	};
	const position = caretDocument.caretPositionFromPoint?.(x, y);
	if (position?.offsetNode.nodeType === 3) {
		const node = position.offsetNode as Text;
		if (pointTouchesRenderedCharacter(document, node, position.offset, x, y)) {
			return { node, offset: position.offset };
		}
	}
	const range = caretDocument.caretRangeFromPoint?.(x, y);
	if (range?.startContainer.nodeType === 3) {
		const node = range.startContainer as Text;
		if (
			pointTouchesRenderedCharacter(document, node, range.startOffset, x, y)
		) {
			return { node, offset: range.startOffset };
		}
	}
	return null;
}

/**
 * Adds one delegated pointer interaction to the rendered book. Section indexes
 * are created lazily and retained until their DOM element is replaced.
 */
export function bindReadListenSentenceSeeking<T>({
	surface,
	targetsBySection,
	onActivate,
	keyboardLabel,
}: {
	surface: HTMLElement;
	targetsBySection: Map<string, ReadListenAnchorTarget<T>[]>;
	onActivate: (value: T) => void;
	keyboardLabel: string;
}): () => void {
	surface.dataset.readListenSentenceSeek = "";
	const keyboardSurface =
		surface.querySelector<HTMLElement>(
			".book-content, .book-content-container",
		) ?? surface;
	const previousKeyboardAttributes = {
		role: keyboardSurface.getAttribute("role"),
		tabindex: keyboardSurface.getAttribute("tabindex"),
		label: keyboardSurface.getAttribute("aria-label"),
		keyshortcuts: keyboardSurface.getAttribute("aria-keyshortcuts"),
	};
	keyboardSurface.setAttribute("role", "region");
	keyboardSurface.tabIndex = 0;
	keyboardSurface.setAttribute("aria-label", keyboardLabel);
	keyboardSurface.setAttribute(
		"aria-keyshortcuts",
		"ArrowUp ArrowDown ArrowLeft ArrowRight Enter Escape",
	);
	let hoveredValue: T | undefined;
	let hoveredRects: Array<{
		left: number;
		right: number;
		top: number;
		bottom: number;
	}> = [];
	let cleanupHover: (() => void) | null = null;
	let pointerFrame = 0;
	let keyboardMatch: ReadListenPositionMatch<T> | undefined;
	let pendingPointer:
		| { target: Element; clientX: number; clientY: number }
		| undefined;

	const clearHoverHighlight = () => {
		cleanupHover?.();
		cleanupHover = null;
		hoveredValue = undefined;
		hoveredRects = [];
	};

	const clearHover = () => {
		pendingPointer = undefined;
		cancelAnimationFrame(pointerFrame);
		pointerFrame = 0;
		clearHoverHighlight();
		delete surface.dataset.readListenSentenceHit;
	};
	const clearHoverGeometry = () => {
		hoveredRects = [];
	};
	const indexForSection = (
		section: Element,
		targets: ReadListenAnchorTarget<T>[],
	) => getReadListenPositionIndex(section, targets);

	const renderedMatches = (): ReadListenPositionMatch<T>[] => {
		const matches: ReadListenPositionMatch<T>[] = [];
		for (const [sectionId, targets] of targetsBySection) {
			const section = surface.ownerDocument.getElementById(sectionId);
			if (!section) continue;
			matches.push(...indexForSection(section, targets).matches);
		}
		return matches;
	};
	const measureMatchRects = (match: ReadListenPositionMatch<T>) =>
		match.resolved.segments.flatMap((segment) => {
			const range = surface.ownerDocument.createRange();
			range.setStart(segment.node, segment.startOffset);
			range.setEnd(segment.node, segment.endOffset);
			return [...range.getClientRects()];
		});

	const showKeyboardMatch = (match: ReadListenPositionMatch<T>) => {
		clearHover();
		keyboardMatch = match;
		cleanupHover = installReadListenHoverHighlight(match.resolved);
	};

	const focusNearestMatch = () => {
		if (keyboardMatch) return;
		const matches = renderedMatches();
		if (!matches.length) return;
		const viewportCenter =
			(surface.ownerDocument.defaultView?.innerHeight ?? 0) / 2;
		let nearest = matches[0];
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const match of matches) {
			const first = match.resolved.segments[0];
			if (!first) continue;
			const range = surface.ownerDocument.createRange();
			range.setStart(first.node, first.startOffset);
			range.setEnd(first.node, first.endOffset);
			const rect = range.getClientRects()[0];
			if (!rect) continue;
			const distance = Math.abs((rect.top + rect.bottom) / 2 - viewportCenter);
			if (distance < nearestDistance) {
				nearest = match;
				nearestDistance = distance;
			}
		}
		if (nearest) showKeyboardMatch(nearest);
	};

	const resolvePointer = (
		target: Element,
		clientX: number,
		clientY: number,
	) => {
		if (target.closest(INTERACTIVE_SELECTOR)) return undefined;
		let section: Element | null = target;
		while (section && !targetsBySection.has(section.id)) {
			section = section.parentElement;
		}
		if (!section) return undefined;
		const position = caretAtPoint(section.ownerDocument, clientX, clientY);
		if (!position) return undefined;
		const index = indexForSection(
			section,
			targetsBySection.get(section.id) ?? [],
		);
		return index.find(position);
	};
	const view = surface.ownerDocument.defaultView;
	const sectionsToWarm = [...targetsBySection];
	const centerTarget = surface.ownerDocument.elementFromPoint?.(
		(surface.ownerDocument.documentElement.clientWidth ||
			view?.innerWidth ||
			0) / 2,
		(surface.ownerDocument.documentElement.clientHeight ||
			view?.innerHeight ||
			0) / 2,
	);
	let centeredSection: Element | null = centerTarget ?? null;
	while (centeredSection && !targetsBySection.has(centeredSection.id)) {
		centeredSection = centeredSection.parentElement;
	}
	if (centeredSection) {
		const centeredIndex = sectionsToWarm.findIndex(
			([sectionId]) => sectionId === centeredSection?.id,
		);
		const centeredEntry = sectionsToWarm[centeredIndex];
		if (centeredIndex > 0 && centeredEntry) {
			sectionsToWarm.splice(centeredIndex, 1);
			sectionsToWarm.unshift(centeredEntry);
		}
	}
	let nextWarmupIndex = 0;
	let idleWarmupId: number | undefined;
	let timeoutWarmupId: number | undefined;
	const scheduleNextWarmup = () => {
		if (!view || nextWarmupIndex >= sectionsToWarm.length) return;
		if (typeof view.requestIdleCallback === "function") {
			idleWarmupId = view.requestIdleCallback(warmNextRenderedIndex, {
				timeout: 200,
			});
		} else {
			timeoutWarmupId = view.setTimeout(warmNextRenderedIndex, 0);
		}
	};
	const warmNextRenderedIndex = () => {
		idleWarmupId = undefined;
		timeoutWarmupId = undefined;
		while (nextWarmupIndex < sectionsToWarm.length) {
			const entry = sectionsToWarm[nextWarmupIndex];
			nextWarmupIndex += 1;
			if (!entry) continue;
			const [sectionId, targets] = entry;
			const section = surface.ownerDocument.getElementById(sectionId);
			if (!section) continue;
			indexForSection(section, targets);
			break;
		}
		scheduleNextWarmup();
	};
	scheduleNextWarmup();

	const showHoverAt = (pointer: {
		target: Element;
		clientX: number;
		clientY: number;
	}) => {
		if (
			!pointer.target.closest(INTERACTIVE_SELECTOR) &&
			hoveredValue !== undefined &&
			hoveredRects.some(
				(rect) =>
					pointer.clientX >= rect.left &&
					pointer.clientX <= rect.right &&
					pointer.clientY >= rect.top &&
					pointer.clientY <= rect.bottom,
			)
		) {
			return;
		}
		const match = resolvePointer(
			pointer.target,
			pointer.clientX,
			pointer.clientY,
		);
		if (match?.value === hoveredValue) {
			if (match && !hoveredRects.length) {
				hoveredRects = measureMatchRects(match);
			}
			return;
		}
		clearHoverHighlight();
		surface.toggleAttribute("data-read-listen-sentence-hit", Boolean(match));
		if (!match) return;
		cleanupHover = installReadListenHoverHighlight(match.resolved);
		hoveredValue = match.value;
		hoveredRects = measureMatchRects(match);
	};

	const showPendingHover = () => {
		pointerFrame = 0;
		const pointer = pendingPointer;
		pendingPointer = undefined;
		if (pointer) showHoverAt(pointer);
	};

	const handlePointerMove = (event: PointerEvent) => {
		const ElementConstructor = surface.ownerDocument.defaultView?.Element;
		if (!ElementConstructor || !(event.target instanceof ElementConstructor)) {
			clearHover();
			return;
		}
		const pointer = {
			target: event.target as Element,
			clientX: event.clientX,
			clientY: event.clientY,
		};
		if (!pointerFrame) {
			showHoverAt(pointer);
			pointerFrame = requestAnimationFrame(showPendingHover);
		} else {
			pendingPointer = pointer;
		}
	};

	const handleSentenceClick = (event: MouseEvent) => {
		const ElementConstructor = surface.ownerDocument.defaultView?.Element;
		if (!ElementConstructor || !(event.target instanceof ElementConstructor)) {
			return;
		}
		const target = event.target as Element;
		if (target.closest(INTERACTIVE_SELECTOR)) return;
		const match = resolvePointer(target, event.clientX, event.clientY);
		if (match) onActivate(match.value);
	};

	const handleKeyboardFocus = () => focusNearestMatch();
	const handleKeyboardBlur = () => {
		keyboardMatch = undefined;
		clearHover();
	};
	const handleKeyboard = (event: KeyboardEvent) => {
		if (event.target !== keyboardSurface) return;
		const matches = renderedMatches();
		if (!matches.length) return;
		if (event.key === "Enter" && keyboardMatch) {
			event.preventDefault();
			event.stopPropagation();
			onActivate(keyboardMatch.value);
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			keyboardMatch = undefined;
			clearHover();
			return;
		}
		const direction =
			event.key === "ArrowDown" || event.key === "ArrowRight"
				? 1
				: event.key === "ArrowUp" || event.key === "ArrowLeft"
					? -1
					: 0;
		if (!direction) return;
		event.preventDefault();
		event.stopPropagation();
		const currentIndex = keyboardMatch
			? matches.findIndex((match) => match.value === keyboardMatch?.value)
			: -1;
		const nextIndex =
			currentIndex < 0
				? direction > 0
					? 0
					: matches.length - 1
				: (currentIndex + direction + matches.length) % matches.length;
		const next = matches[nextIndex];
		if (!next) return;
		showKeyboardMatch(next);
		next.resolved.segments[0]?.node.parentElement?.scrollIntoView({
			block: "center",
			inline: "center",
		});
	};

	surface.addEventListener("pointermove", handlePointerMove);
	surface.addEventListener("pointerleave", clearHover);
	surface.addEventListener("click", handleSentenceClick);
	surface.addEventListener("scroll", clearHoverGeometry, true);
	view?.addEventListener("resize", clearHoverGeometry);
	keyboardSurface.addEventListener("focus", handleKeyboardFocus);
	keyboardSurface.addEventListener("blur", handleKeyboardBlur);
	keyboardSurface.addEventListener("keydown", handleKeyboard);
	return () => {
		const restoreAttribute = (name: string, value: string | null) => {
			if (value === null) keyboardSurface.removeAttribute(name);
			else keyboardSurface.setAttribute(name, value);
		};
		if (idleWarmupId !== undefined) view?.cancelIdleCallback(idleWarmupId);
		if (timeoutWarmupId !== undefined) view?.clearTimeout(timeoutWarmupId);
		clearHover();
		delete surface.dataset.readListenSentenceSeek;
		surface.removeEventListener("pointermove", handlePointerMove);
		surface.removeEventListener("pointerleave", clearHover);
		surface.removeEventListener("click", handleSentenceClick);
		surface.removeEventListener("scroll", clearHoverGeometry, true);
		view?.removeEventListener("resize", clearHoverGeometry);
		keyboardSurface.removeEventListener("focus", handleKeyboardFocus);
		keyboardSurface.removeEventListener("blur", handleKeyboardBlur);
		keyboardSurface.removeEventListener("keydown", handleKeyboard);
		restoreAttribute("role", previousKeyboardAttributes.role);
		restoreAttribute("tabindex", previousKeyboardAttributes.tabindex);
		restoreAttribute("aria-label", previousKeyboardAttributes.label);
		restoreAttribute(
			"aria-keyshortcuts",
			previousKeyboardAttributes.keyshortcuts,
		);
	};
}
