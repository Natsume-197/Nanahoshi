import type { RefObject } from "react";
import {
	toPlayerData,
	useAudioPlayerActions,
	useAudioPlayerBook,
} from "@/context/audio-player-context";
import type {
	ReaderSourceFormat,
	ReaderTextAnchor,
	Section,
} from "@/features/reader/document/types";
import type { BookReaderApi } from "@/features/reader/reader-contract";
import { useMountEffect } from "@/hooks/use-mount-effect";
import {
	bindReadListenManualFollowPause,
	resolveActiveCueFollowDecision,
} from "@/lib/read-listen/active-cue-following";
import { bindReadListenSentenceSeeking } from "@/lib/read-listen/sentence-seeking";
import {
	getReadListenPositionIndex,
	installReadListenActiveHighlight,
	invalidateReadListenPositionIndex,
	type ResolvedReadListenAnchor,
} from "@/lib/read-listen/text-anchor";
import { findReadListenCueNearCharacter } from "@/lib/read-listen/text-position";
import {
	type ReadListenTimelineCue,
	toReaderSectionReference,
} from "@/lib/read-listen/timeline";
import { m } from "@/paraglide/messages";
import type { client } from "@/utils/orpc";

const MAX_ANCHOR_FRAMES = 30;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function followScrollBehavior(): ScrollBehavior {
	return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
}

function visibleAnchorBounds(resolved: ResolvedReadListenAnchor) {
	let top = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	let left = Number.POSITIVE_INFINITY;
	for (const segment of resolved.segments) {
		const document = segment.node.ownerDocument;
		const range = document.createRange();
		range.setStart(segment.node, segment.startOffset);
		range.setEnd(segment.node, segment.endOffset);
		const rects =
			typeof range.getClientRects === "function"
				? Array.from(range.getClientRects())
				: [];
		const measured = rects.length
			? rects
			: segment.node.parentElement
				? [segment.node.parentElement.getBoundingClientRect()]
				: [];
		for (const rect of measured) {
			if (rect.width === 0 && rect.height === 0) continue;
			top = Math.min(top, rect.top);
			right = Math.max(right, rect.right);
			bottom = Math.max(bottom, rect.bottom);
			left = Math.min(left, rect.left);
		}
	}
	return Number.isFinite(top) ? { top, right, bottom, left } : undefined;
}

function fixedReaderInsets(document: Document) {
	const view = document.defaultView;
	if (!view) return { top: 0, bottom: 0 };
	const header = document.querySelector<HTMLElement>("[data-reader-header]");
	const player = document.querySelector<HTMLElement>(
		".read-listen-player-dock",
	);
	const headerRect = header?.getBoundingClientRect();
	const playerRect = player?.getBoundingClientRect();
	return {
		top: Math.max(0, headerRect?.bottom ?? 0),
		bottom: Math.max(
			0,
			view.innerHeight - (playerRect?.top ?? view.innerHeight),
		),
	};
}

function shouldMoveActiveCue(
	resolved: Parameters<typeof installReadListenActiveHighlight>[0],
	force: boolean,
) {
	const bounds = visibleAnchorBounds(resolved);
	const document = resolved.segments[0]?.node.ownerDocument;
	const view = document?.defaultView;
	if (!bounds || !view) return true;
	const insets = fixedReaderInsets(document);
	const content =
		resolved.segments[0]?.node.parentElement?.closest(".book-content");
	const paginated = content?.classList.contains("book-content--paginated");
	const verticalWriting = content?.classList.contains(
		"book-content--writing-vertical-rl",
	);
	const vertical = resolveActiveCueFollowDecision({
		mode: "following",
		strategy: paginated || verticalWriting ? "visibility" : "comfort",
		force,
		cue: { start: bounds.top, end: bounds.bottom },
		viewport: { start: 0, end: view.innerHeight },
		startInset: insets.top,
		endInset: insets.bottom,
	});
	const horizontal = resolveActiveCueFollowDecision({
		mode: "following",
		strategy: paginated || !verticalWriting ? "visibility" : "comfort",
		force,
		cue: { start: bounds.left, end: bounds.right },
		viewport: { start: 0, end: view.innerWidth },
	});
	return vertical.scroll || horizontal.scroll;
}

function semanticReaderAnchor(
	target: ReadListenTimelineCue["text"],
	sectionReference: string,
	sectionTargets: ReadonlyArray<{
		anchor: ReadListenTimelineCue["text"];
		value: ReadListenTimelineCue;
	}>,
	targetIndex: number,
): ReaderTextAnchor {
	if (target.kind === "fragment") return { ...target, sectionReference };
	const normalizedExact = target.exact.replace(/\s+/gu, " ").trim();
	const occurrence = sectionTargets.slice(0, targetIndex).filter((entry) => {
		return (
			entry.anchor.kind === "text-quote" &&
			entry.anchor.exact.replace(/\s+/gu, " ").trim() === normalizedExact
		);
	}).length;
	return { ...target, sectionReference, occurrence };
}

type AudiobookDetails = Awaited<
	ReturnType<typeof client.audiobooks.getDetails>
>;

export function LoadReadListenAudiobook({
	details,
	isAudiobookLoaded,
}: {
	details: AudiobookDetails;
	isAudiobookLoaded: boolean;
}) {
	return (
		<LoadReadListenAudiobookOnMount
			key={`${details.uuid}:${isAudiobookLoaded}`}
			details={details}
		/>
	);
}

function LoadReadListenAudiobookOnMount({
	details,
}: {
	details: AudiobookDetails;
}) {
	const audiobook = useAudioPlayerBook();
	const { loadAudiobook, setExpanded } = useAudioPlayerActions();

	useMountEffect(() => {
		if (audiobook?.uuid !== details.uuid) {
			loadAudiobook(toPlayerData(details), { autoplay: false });
		}
		return () => setExpanded(false);
	});
	return null;
}

export function ActiveReadListenCue({
	cue,
	sectionTargets,
	followText,
	sourceFormat,
	readerApiRef,
	forceFollow = false,
	onFollowSettled,
}: {
	cue: ReadListenTimelineCue;
	sectionTargets: ReadonlyArray<{
		anchor: ReadListenTimelineCue["text"];
		value: ReadListenTimelineCue;
	}>;
	followText: boolean;
	sourceFormat: ReaderSourceFormat;
	readerApiRef: RefObject<BookReaderApi | null>;
	forceFollow?: boolean;
	onFollowSettled?: () => void;
}) {
	useMountEffect(() => {
		let cancelled = false;
		let animationFrame = 0;
		let cleanupHighlight: (() => void) | undefined;
		let attempts = 0;
		let readerOwnsFollowNavigation = false;
		const sectionReference = toReaderSectionReference(
			cue.text.sectionRef,
			sourceFormat,
		);
		const targetIndex = Math.max(
			0,
			sectionTargets.findIndex((target) => target.value.id === cue.id),
		);
		const readerAnchor = semanticReaderAnchor(
			cue.text,
			sectionReference,
			sectionTargets,
			targetIndex,
		);
		const retryInstall = () => {
			attempts += 1;
			if (attempts < MAX_ANCHOR_FRAMES) {
				animationFrame = requestAnimationFrame(install);
			}
		};

		function install() {
			if (cancelled) return;
			if (
				followText &&
				attempts === 0 &&
				readerApiRef.current?.navigateToTextAnchor
			) {
				readerOwnsFollowNavigation = true;
				readerApiRef.current.navigateToTextAnchor(readerAnchor);
				retryInstall();
				return;
			}
			const section = document.getElementById(sectionReference);
			if (!section) {
				if (followText && attempts === 0) {
					if (readerApiRef.current?.navigateToTextAnchor) {
						readerOwnsFollowNavigation = true;
						readerApiRef.current.navigateToTextAnchor(readerAnchor);
					} else {
						readerApiRef.current?.navigateToSection(sectionReference);
					}
				}
				retryInstall();
				return;
			}
			const resolved = getReadListenPositionIndex(section, sectionTargets).get(
				cue,
			)?.resolved;
			if (!resolved) {
				if (followText) {
					invalidateReadListenPositionIndex(section, sectionTargets);
					retryInstall();
				}
				return;
			}
			cleanupHighlight =
				installReadListenActiveHighlight(resolved) ?? undefined;
			if (
				followText &&
				!readerOwnsFollowNavigation &&
				shouldMoveActiveCue(resolved, forceFollow)
			) {
				resolved.segments[0]?.node.parentElement?.scrollIntoView({
					behavior: followScrollBehavior(),
					block: "center",
					inline: "center",
				});
			}
			if (followText) onFollowSettled?.();
		}

		install();
		return () => {
			cancelled = true;
			cancelAnimationFrame(animationFrame);
			cleanupHighlight?.();
		};
	});
	return null;
}

export function ReadListenManualFollowPause({
	surfaceRef,
	onPause,
}: {
	surfaceRef: RefObject<HTMLElement | null>;
	onPause: () => void;
}) {
	useMountEffect(() => {
		const surface = surfaceRef.current;
		if (!surface) return;
		return bindReadListenManualFollowPause({ surface, onPause });
	});
	return null;
}

export function ReadListenSentenceSeeking({
	surfaceRef,
	targetsBySection,
}: {
	surfaceRef: RefObject<HTMLElement | null>;
	targetsBySection: Map<
		string,
		Array<{
			anchor: ReadListenTimelineCue["text"];
			value: ReadListenTimelineCue;
		}>
	>;
}) {
	const { seekTo } = useAudioPlayerActions();

	useMountEffect(() => {
		const surface = surfaceRef.current;
		if (!surface) return;
		return bindReadListenSentenceSeeking({
			surface,
			targetsBySection,
			onActivate: (cue) => seekTo(cue.globalStartMs / 1000),
			keyboardLabel: m["read_listen.sentence_seek_instructions"](),
		});
	});
	return null;
}

export function SeekReadListenFromText({
	targetCharacter,
	sections,
	targetsBySection,
	readerApiRef,
	sourceFormat,
	onSettled,
}: {
	targetCharacter: number;
	sections: Section[];
	targetsBySection: Map<
		string,
		Array<{
			anchor: ReadListenTimelineCue["text"];
			value: ReadListenTimelineCue;
		}>
	>;
	readerApiRef: RefObject<BookReaderApi | null>;
	sourceFormat: ReaderSourceFormat;
	onSettled: (cue: ReadListenTimelineCue | undefined) => void;
}) {
	const { seekTo } = useAudioPlayerActions();

	useMountEffect(() => {
		let cancelled = false;
		let animationFrame = 0;
		let attempts = 0;
		const nearestSectionTargets = sections
			.map((section) => {
				const start = section.startCharacter ?? 0;
				const end = start + (section.characters ?? 0);
				const distance =
					targetCharacter < start
						? start - targetCharacter
						: targetCharacter > end
							? targetCharacter - end
							: 0;
				return {
					distance,
					targets: targetsBySection.get(section.reference) ?? [],
				};
			})
			.filter((entry) => entry.targets.length > 0)
			.sort((left, right) => left.distance - right.distance)[0]?.targets;
		const quoteOccurrences = new Map<string, number>();
		const semanticNearestTargets = (nearestSectionTargets ?? []).map(
			(target) => {
				const sectionReference = toReaderSectionReference(
					target.anchor.sectionRef,
					sourceFormat,
				);
				if (target.anchor.kind === "fragment") {
					return { target, anchor: { ...target.anchor, sectionReference } };
				}
				const key = `${sectionReference}\u0000${target.anchor.exact.replace(/\s+/gu, " ").trim()}`;
				const occurrence = quoteOccurrences.get(key) ?? 0;
				quoteOccurrences.set(key, occurrence + 1);
				return {
					target,
					anchor: { ...target.anchor, sectionReference, occurrence },
				};
			},
		);
		const apply = () => {
			if (cancelled) return;
			const focusCue = semanticNearestTargets
				.map((entry) => ({
					target: entry.target,
					character: readerApiRef.current?.resolveTextAnchor?.(
						entry.anchor as ReaderTextAnchor,
					),
				}))
				.filter(
					(entry): entry is typeof entry & { character: number } =>
						entry.character !== undefined,
				)
				.sort(
					(left, right) =>
						Math.abs(left.character - targetCharacter) -
						Math.abs(right.character - targetCharacter),
				)[0]?.target.value;
			const cue =
				focusCue ??
				findReadListenCueNearCharacter({
					targetCharacter,
					sections,
					targetsBySection,
					document,
				});
			if (cue) {
				seekTo(cue.globalStartMs / 1000);
				onSettled(cue);
				return;
			}
			attempts += 1;
			if (attempts < MAX_ANCHOR_FRAMES) {
				animationFrame = requestAnimationFrame(apply);
			} else {
				onSettled(undefined);
			}
		};

		apply();
		return () => {
			cancelled = true;
			cancelAnimationFrame(animationFrame);
		};
	});
	return null;
}
