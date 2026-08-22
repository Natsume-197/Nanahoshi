import type { FocusTextSpeed } from "@/features/reader/presentation/settings";

const UNIT_CLASS = "focus-typewriter-unit";
const HIDDEN_CLASS = "focus-typewriter-hidden";
const INDICATOR_CLASS = "focus-sentence-indicator";

const GLYPH_RATES: Record<Exclude<FocusTextSpeed, "instant">, number> = {
	slow: 18,
	normal: 45,
	fast: 90,
};

const MAX_TYPED_GLYPHS = 600;

export function typewriterRate(speed: FocusTextSpeed): number | null {
	return speed === "instant" ? null : GLYPH_RATES[speed];
}

const ATOMIC_TAGS = new Set(["RUBY", "IMG", "SVG", "BR"]);

const LONG_PAUSE = /[。．！？!?…‥]/u;
const SHORT_PAUSE = /[、，,；;：:」』）)]/u;

export interface TypewriterStep {
	element: HTMLElement;
	cost: number;
}

function pauseAfter(glyph: string): number {
	if (LONG_PAUSE.test(glyph)) return 6;
	if (SHORT_PAUSE.test(glyph)) return 2;
	return 0;
}

export interface TypewriterHandle {
	finish(): void;
	stop(): void;
}

interface TypewriterClock {
	now(): number;
	request(callback: () => void): number;
	cancel(handle: number): void;
}

let graphemeSegmenter: Intl.Segmenter | undefined;

function graphemes(text: string): string[] {
	if (typeof Intl?.Segmenter !== "function") return [...text];
	graphemeSegmenter ??= new Intl.Segmenter(undefined, {
		granularity: "grapheme",
	});
	return [...graphemeSegmenter.segment(text)].map((entry) => entry.segment);
}

function stepCost(glyph: string): number {
	return glyph.trim() ? 1 : 0;
}

function wrapGlyph(document: Document, glyph: string): HTMLElement {
	const span = document.createElement("span");
	span.className = `${UNIT_CLASS} ${HIDDEN_CLASS}`;
	span.textContent = glyph;
	return span;
}

export function prepareTypewriter(root: HTMLElement): TypewriterStep[] {
	if ((root.textContent?.length ?? 0) > MAX_TYPED_GLYPHS) return [];
	const document = root.ownerDocument;
	const steps: TypewriterStep[] = [];
	let pending = 0;

	const walk = (node: Node) => {
		for (const child of [...node.childNodes]) {
			if (child.nodeType === Node.TEXT_NODE) {
				const text = child.textContent ?? "";
				if (!text) continue;
				const fragment = document.createDocumentFragment();
				for (const glyph of graphemes(text)) {
					const span = wrapGlyph(document, glyph);
					fragment.append(span);
					steps.push({ element: span, cost: stepCost(glyph) + pending });
					pending = pauseAfter(glyph);
				}
				child.parentNode?.replaceChild(fragment, child);
				continue;
			}
			if (child.nodeType !== Node.ELEMENT_NODE) continue;
			const element = child as HTMLElement;
			if (ATOMIC_TAGS.has(element.tagName)) {
				element.classList.add(HIDDEN_CLASS);
				steps.push({
					element,
					cost: (element.tagName === "BR" ? 0 : 1) + pending,
				});
				pending = 0;
				continue;
			}
			walk(element);
		}
	};

	walk(root);
	return steps;
}

export function stepRevealTimes(
	steps: readonly TypewriterStep[],
	charactersPerSecond: number,
): number[] {
	const interval = 1000 / Math.max(1, charactersPerSecond);
	let elapsed = 0;
	return steps.map((step) => {
		elapsed += step.cost * interval;
		return elapsed;
	});
}

export function runTypewriter(
	steps: readonly TypewriterStep[],
	options: {
		charactersPerSecond: number;
		onFinish: () => void;
		clock?: TypewriterClock;
	},
): TypewriterHandle {
	const clock: TypewriterClock = options.clock ?? {
		now: () => performance.now(),
		request: (callback) => requestAnimationFrame(callback),
		cancel: (handle) => cancelAnimationFrame(handle),
	};
	const times = stepRevealTimes(steps, options.charactersPerSecond);
	const start = clock.now();
	let index = 0;
	let frame: number | undefined;
	let settled = false;

	const revealUntil = (limit: number) => {
		while (index < steps.length && (times[index] ?? 0) <= limit) {
			steps[index]?.element.classList.remove(HIDDEN_CLASS);
			index += 1;
		}
	};

	const settle = () => {
		if (settled) return;
		settled = true;
		options.onFinish();
	};

	const tick = () => {
		revealUntil(clock.now() - start);
		if (index >= steps.length) {
			frame = undefined;
			settle();
			return;
		}
		frame = clock.request(tick);
	};

	frame = clock.request(tick);

	return {
		finish() {
			if (frame !== undefined) clock.cancel(frame);
			frame = undefined;
			revealUntil(Number.POSITIVE_INFINITY);
			settle();
		},
		stop() {
			if (frame !== undefined) clock.cancel(frame);
			frame = undefined;
			settled = true;
		},
	};
}

function lastGlyphBox(
	root: HTMLElement,
	lastGlyph?: HTMLElement,
): { rect: DOMRect; element: Element } | undefined {
	if (lastGlyph?.isConnected) {
		return { rect: lastGlyph.getBoundingClientRect(), element: lastGlyph };
	}
	const document = root.ownerDocument;
	const walker = document.createTreeWalker(
		root,
		root.ownerDocument.defaultView?.NodeFilter.SHOW_TEXT ?? 4,
	);
	let lastText: Text | undefined;
	let current = walker.nextNode();
	while (current) {
		const node = current as Text;
		if (node.data.trim() && !node.parentElement?.closest("rt,rp")) {
			lastText = node;
		}
		current = walker.nextNode();
	}
	const element = lastText?.parentElement;
	if (!lastText || !element) return undefined;
	const range = document.createRange();
	range.setStart(lastText, Math.max(0, lastText.data.length - 1));
	range.setEnd(lastText, lastText.data.length);
	const rect =
		typeof range.getBoundingClientRect === "function"
			? range.getBoundingClientRect()
			: element.getBoundingClientRect();
	return { rect, element };
}

export function insertSentenceIndicator(
	root: HTMLElement,
	lastGlyph?: HTMLElement,
): HTMLElement | undefined {
	for (const stale of root.querySelectorAll(`.${INDICATOR_CLASS}`)) {
		stale.remove();
	}
	const anchor = lastGlyphBox(root, lastGlyph);
	if (!anchor) return undefined;
	const { rect: glyph } = anchor;
	const view = root.ownerDocument.defaultView;

	const indicator = root.ownerDocument.createElement("span");
	indicator.className = INDICATOR_CLASS;
	indicator.setAttribute("aria-hidden", "true");
	const fontSize = view?.getComputedStyle(anchor.element).fontSize;
	if (fontSize) indicator.style.fontSize = fontSize;
	root.append(indicator);

	const host = root.getBoundingClientRect();
	const size = indicator.offsetWidth;
	const gap = size / 2;
	const vertical = view
		?.getComputedStyle(root)
		.writingMode.startsWith("vertical");
	if (vertical) {
		indicator.style.left = `${glyph.left - host.left + (glyph.width - size) / 2}px`;
		indicator.style.top = `${glyph.bottom - host.top + gap}px`;
	} else {
		indicator.style.left = `${glyph.right - host.left + gap}px`;
		indicator.style.top = `${glyph.top - host.top + (glyph.height - size) / 2}px`;
	}
	return indicator;
}
