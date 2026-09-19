import type { LazyHtmlBook } from "../../src/features/reader/document/lazy-html-book";
import { countTextCharacters } from "../../src/features/reader/document/processing/character-count";

declare global {
	interface Window {
		fixture: {
			index: number;
			entry: number;
			following: boolean;
			audio: HTMLAudioElement | null;
			play(): Promise<void>;
			resume(): void;
			cue(index: number): void;
			reenter(): void;
			replace(): void;
			next(): void;
			expected: string;
		};
	}
}

// Browser fixture: real reader engines and cue binding, synthetic aligned text.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
	ActiveReadListenCue,
	ReadListenManualFollowPause,
} from "../../src/components/read-listen/read-listen-bindings";
import type { BookReaderApi } from "../../src/features/reader/reader-contract";
import { BookReaderContinuous } from "../../src/features/reader/renderers/continuous/book-reader-continuous";
import { BookReaderPaginated } from "../../src/features/reader/renderers/paginated/book-reader-paginated";
import { resolveReadListenTimelinePosition } from "../../src/lib/read-listen/timeline";

const params = new URLSearchParams(location.search);
const verticalMode = params.get("vertical") === "true";
const paginated = params.get("mode") !== "scroll";
const sectionTexts = Array.from({ length: 10 }, (_, chapter) =>
	Array.from(
		{ length: 32 },
		(_, line) =>
			`第${chapter + 1}章の第${line + 1}文。風が静かに吹いて、遠くの山々に美しい光が差していました。`,
	)
		.map((text) => `<p>${text}</p>`)
		.join(""),
);
let start = 0;
const sections = sectionTexts.map((html, i) => {
	const characters = countTextCharacters(html.replace(/<[^>]+>/g, ""));
	const section = {
		reference: `nanahoshi-epub-chapter-${i}-xhtml`,
		characters,
		startCharacter: start,
		charactersWeight: characters,
	};
	start += characters;
	return section;
});
const cues = sectionTexts.flatMap((html, chapter) =>
	Array.from(html.matchAll(/<p>(.*?)<\/p>/g), (match, line) => ({
		id: `${chapter}-${line}`,
		text: {
			kind: "text-quote" as const,
			sectionRef: `chapter-${chapter}.xhtml`,
			exact: match[1] ?? "",
		},
		audioFileIndex: 0,
		startMs: (chapter * 32 + line) * 1000,
		endMs: (chapter * 32 + line + 1) * 1000,
		globalStartMs: (chapter * 32 + line) * 1000,
		globalEndMs: (chapter * 32 + line + 1) * 1000,
	})),
);
const targets = sections.map((_, chapter) =>
	cues
		.slice(chapter * 32, (chapter + 1) * 32)
		.map((value) => ({ anchor: value.text, value })),
);
const apiRef: { current: BookReaderApi | null } = { current: null };
const delay = Number(params.get("delay") ?? 0);
const plainSectionHtml = (index: number) =>
	params.has("packed")
		? sectionTexts[index]?.replaceAll("</p><p>", "")
		: sectionTexts[index];
const sectionHtml = (index: number) => {
	const html = params.has("boundary")
		? plainSectionHtml(index)?.replaceAll(
				"ました。",
				"まし<ruby>た<rt>た</rt></ruby>。",
			)
		: plainSectionHtml(index);
	return params.has("ruby")
		? html?.replaceAll(
				"山々",
				"<ruby>山々<rp>（</rp><rt>やまやま</rt><rp>）</rp></ruby>",
			)
		: html;
};
const lazyBook = {
	sectionCharacterCounts: sections.map((section) => section.characters),
	async loadSection(index: number) {
		await new Promise((resolve) => setTimeout(resolve, delay));
		return { elementHtml: sectionHtml(index), styleSheet: "", objectUrls: [] };
	},
};
const base = {
	htmlContent: sectionTexts
		.map(
			(_, i) => `<div id="${sections[i]?.reference}">${sectionHtml(i)}</div>`,
		)
		.join(""),
	language: "ja",
	verticalMode,
	theme: {
		id: "test",
		fontColor: "#111",
		backgroundColor: "white",
		selectionFontColor: "white",
		selectionBackgroundColor: "black",
		hintFuriganaShadowColor: "transparent",
		hintFuriganaFontColor: "black",
		tooltipTextFontColor: "black",
	},
	fontFamilyGroupOne: "serif",
	fontFamilyGroupTwo: "sans-serif",
	fontWeight: null,
	fontSize: params.has("boundary") ? 27 : 22,
	lineHeight: params.has("boundary") ? 2 : 1.6,
	textIndentation: 0,
	textMarginMode: "auto" as const,
	textMarginValue: 0,
	verticalTextOrientation: "mixed" as const,
	enableFontKerning: false,
	enableFontVPAL: false,
	prioritizeReaderStyles: false,
	enableTextJustification: false,
	enableTextWrapPretty: false,
	secondDimensionMaxValue: 0,
	firstDimensionMargin: params.has("boundary") ? innerWidth * 0.1 : 16,
	hideFurigana: false,
	furiganaStyle: "Partial" as const,
	disableWheelNavigation: false,
	navigationBlocked: false,
	sections,
	initialPosition: undefined,
	onPositionChange: () => {},
	onSectionProgressChange: () => {},
	apiRef: (api: BookReaderApi | null) => {
		apiRef.current = api;
	},
};
// A real media clock drives timeline selection without page/seek interaction.
let narration: HTMLAudioElement | null = null;
async function playNarration(onCue: (index: number) => void) {
	const sampleRate = 8000;
	const samples = sampleRate * 64;
	const buffer = new ArrayBuffer(44 + samples * 2);
	const view = new DataView(buffer);
	const text = (offset: number, value: string) => {
		for (let i = 0; i < value.length; i++)
			view.setUint8(offset + i, value.charCodeAt(i));
	};
	text(0, "RIFF");
	view.setUint32(4, buffer.byteLength - 8, true);
	text(8, "WAVEfmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 1, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 2, true);
	view.setUint16(32, 2, true);
	view.setUint16(34, 16, true);
	text(36, "data");
	view.setUint32(40, samples * 2, true);
	const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
	const audio = new Audio(url);
	narration = audio;
	audio.playbackRate = 4;
	audio.addEventListener("timeupdate", () => {
		const position = resolveReadListenTimelinePosition(
			cues,
			Math.min(audio.currentTime, 63.99) * 1000,
		);
		if (position.activeIndex >= 0) onCue(position.activeIndex);
	});
	audio.addEventListener("ended", () => URL.revokeObjectURL(url), {
		once: true,
	});
	await audio.play();
}
function Fixture() {
	const [index, setIndex] = useState(Number(params.get("cue") ?? 0));
	const [entry, setEntry] = useState(0);
	const [following, setFollowing] = useState(true);
	const cue = cues[index];
	const section = sections[Math.floor(index / 32)];
	if (!cue || !section) throw new Error("Invalid fixture cue");
	Object.assign(window, {
		fixture: {
			index,
			entry,
			following,
			get audio() {
				return narration;
			},
			play: () => playNarration(setIndex),
			resume: () => setFollowing(true),
			cue: (next: number) => setIndex(next),
			reenter: () => setEntry((value) => value + 1),
			replace: () => apiRef.current?.navigateToSection(section.reference),
			next: () => apiRef.current?.nextPage(),
			expected: cue.text.exact,
		},
	});
	return (
		<>
			{paginated ? (
				<BookReaderPaginated
					{...base}
					lazyBook={
						params.has("delay")
							? (lazyBook as unknown as LazyHtmlBook)
							: undefined
					}
					avoidPageBreak={params.get("avoid") === "true"}
					pageColumns={Number(params.get("columns") ?? 1)}
					reservePlayerSpace
				/>
			) : (
				<BookReaderContinuous
					{...base}
					autoPositionOnResize
					reservePlayerSpace
					scrollContainerRef={{ current: document.getElementById("root") }}
				/>
			)}
			<ActiveReadListenCue
				key={`${index}:${entry}:${following}`}
				cue={cue}
				sectionTargets={targets[Math.floor(index / 32)] ?? []}
				sourceFormat="epub"
				followText={following}
				readerApiRef={apiRef}
			/>
			{following && (
				<ReadListenManualFollowPause
					surfaceRef={{ current: document.getElementById("root") }}
					onPause={() => setFollowing(false)}
				/>
			)}
		</>
	);
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
root.style.height = "calc(100dvh - 80px)";
root.style.width = "100dvw";
root.style.overflow = paginated ? "hidden" : "auto";
if (!paginated) root.style.scrollbarGutter = "stable";
createRoot(root).render(<Fixture />);
