import type { RefObject } from "react";
import type { BookReaderApi } from "@/components/reader/reader-shared-props";
import {
	toPlayerData,
	useAudioPlayerActions,
	useAudioPlayerBook,
} from "@/context/audio-player-context";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { bindReadListenSentenceSeeking } from "@/lib/read-listen/sentence-seeking";
import {
	getReadListenPositionIndex,
	installReadListenActiveHighlight,
} from "@/lib/read-listen/text-anchor";
import { findReadListenCueNearCharacter } from "@/lib/read-listen/text-position";
import {
	type ReadListenTimelineCue,
	toReaderSectionReference,
} from "@/lib/read-listen/timeline";
import type { ReaderSourceFormat, Section } from "@/lib/reader/types";
import { m } from "@/paraglide/messages";
import type { client } from "@/utils/orpc";

const MAX_ANCHOR_FRAMES = 30;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function followScrollBehavior(): ScrollBehavior {
	return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
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
}: {
	cue: ReadListenTimelineCue;
	sectionTargets: ReadonlyArray<{
		anchor: ReadListenTimelineCue["text"];
		value: ReadListenTimelineCue;
	}>;
	followText: boolean;
	sourceFormat: ReaderSourceFormat;
	readerApiRef: RefObject<BookReaderApi | null>;
}) {
	useMountEffect(() => {
		let cancelled = false;
		let animationFrame = 0;
		let cleanupHighlight: (() => void) | undefined;
		let attempts = 0;
		const sectionReference = toReaderSectionReference(
			cue.text.sectionRef,
			sourceFormat,
		);

		const install = () => {
			if (cancelled) return;
			const section = document.getElementById(sectionReference);
			if (!section) {
				if (followText && attempts === 0) {
					readerApiRef.current?.navigateToSection(sectionReference);
				}
				attempts += 1;
				if (attempts < MAX_ANCHOR_FRAMES) {
					animationFrame = requestAnimationFrame(install);
				}
				return;
			}
			const resolved = getReadListenPositionIndex(section, sectionTargets).get(
				cue,
			)?.resolved;
			if (!resolved) return;
			cleanupHighlight =
				installReadListenActiveHighlight(resolved) ?? undefined;
			if (followText) {
				resolved.segments[0]?.node.parentElement?.scrollIntoView({
					behavior: followScrollBehavior(),
					block: "center",
					inline: "center",
				});
			}
		};

		install();
		return () => {
			cancelled = true;
			cancelAnimationFrame(animationFrame);
			cleanupHighlight?.();
		};
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
	onSettled: (cue: ReadListenTimelineCue | undefined) => void;
}) {
	const { seekTo } = useAudioPlayerActions();

	useMountEffect(() => {
		let cancelled = false;
		let animationFrame = 0;
		let attempts = 0;
		const apply = () => {
			if (cancelled) return;
			const cue = findReadListenCueNearCharacter({
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
