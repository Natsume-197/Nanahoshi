import {
	ArrowLeft,
	ArrowRight,
	BookOpenText,
	Crosshair,
	CursorClick,
	Repeat,
	RepeatOnce,
} from "@phosphor-icons/react";
import { PlayerIconButton } from "@/components/audio-player/player-controls";
import type { SentenceRepeatMode } from "@/lib/read-listen/sentence-repeat";
import type { ReaderThemeColors } from "@/lib/reader/settings";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

/** Read & Listen contributes context to the player, never playback controls. */
export type ReadListenPlayerContext = {
	readerTheme?: Pick<ReaderThemeColors, "backgroundColor" | "fontColor">;
	statusText: string;
	onExitReadListen: () => void;
	canSeekPreviousSentence: boolean;
	onSeekPreviousSentence: () => void;
	canSeekNextSentence: boolean;
	onSeekNextSentence: () => void;
	canRepeatSentence: boolean;
	sentenceRepeatMode: SentenceRepeatMode;
	onCycleSentenceRepeatMode: () => void;
	followText: boolean;
	onToggleFollowText: () => void;
	seekFromText: boolean;
	onToggleSeekFromText: () => void;
};

export function ReadListenOpenButton({
	onOpen,
	className,
	side = "top",
	label = m["read_listen.open_reader"](),
	pressed,
	onIntent,
	onCommitIntent,
}: {
	onOpen: () => void;
	className?: string;
	side?: "top" | "bottom";
	label?: string;
	pressed?: boolean;
	onIntent?: () => void;
	onCommitIntent?: () => void;
}) {
	return (
		<PlayerIconButton
			label={label}
			side={side}
			pressed={pressed}
			onClick={onOpen}
			onPointerEnter={onIntent}
			onFocus={onCommitIntent}
			onPointerDown={onCommitIntent}
			className={cn(pressed && "bg-accent text-accent-foreground", className)}
		>
			<BookOpenText
				aria-hidden="true"
				className="size-5"
				weight={pressed ? "fill" : "regular"}
			/>
		</PlayerIconButton>
	);
}

export function ReadListenFollowButton({
	context,
	className,
	side = "top",
}: {
	context: ReadListenPlayerContext;
	className?: string;
	side?: "top" | "bottom";
}) {
	return (
		<PlayerIconButton
			label={m["read_listen.follow_text"]()}
			side={side}
			pressed={context.followText}
			onClick={context.onToggleFollowText}
			className={cn(
				context.followText && "bg-accent text-accent-foreground",
				className,
			)}
		>
			<Crosshair
				aria-hidden="true"
				className="size-5"
				weight={context.followText ? "fill" : "regular"}
			/>
		</PlayerIconButton>
	);
}

export function ReadListenSentenceControls({
	context,
	className,
	buttonClassName,
	side = "top",
	showStepLabels = false,
}: {
	context: ReadListenPlayerContext;
	className?: string;
	buttonClassName?: string;
	side?: "top" | "bottom";
	showStepLabels?: boolean;
}) {
	const previousLabel = m["read_listen.previous_sentence"]();
	const nextLabel = m["read_listen.next_sentence"]();
	const repeatLabel =
		context.sentenceRepeatMode === "off"
			? m["read_listen.repeat_sentence_once"]()
			: context.sentenceRepeatMode === "once"
				? m["read_listen.repeat_sentence_loop"]()
				: m["read_listen.stop_sentence_repeat"]();
	const stepButtonClassName = cn(
		"size-10 shrink-0 text-foreground",
		showStepLabels && "md:w-auto md:px-3",
		buttonClassName,
	);

	return (
		<fieldset
			className={cn(
				"flex min-w-0 items-center gap-0.5 rounded-full bg-foreground/[0.06] p-0.5",
				"border-0",
				className,
			)}
		>
			<legend className="sr-only">{m["read_listen.controls_label"]()}</legend>
			<PlayerIconButton
				label={previousLabel}
				side={side}
				disabled={!context.canSeekPreviousSentence}
				onClick={context.onSeekPreviousSentence}
				className={stepButtonClassName}
			>
				<ArrowLeft aria-hidden="true" className="size-5 shrink-0" />
				{showStepLabels && (
					<span className="hidden md:inline">{previousLabel}</span>
				)}
			</PlayerIconButton>
			<PlayerIconButton
				label={repeatLabel}
				side={side}
				disabled={!context.canRepeatSentence}
				pressed={context.sentenceRepeatMode !== "off"}
				onClick={context.onCycleSentenceRepeatMode}
				className={cn(
					"size-10 shrink-0 text-foreground",
					context.sentenceRepeatMode !== "off" &&
						"bg-accent text-accent-foreground",
					buttonClassName,
				)}
			>
				{context.sentenceRepeatMode === "loop" ? (
					<Repeat aria-hidden="true" className="size-5" weight="fill" />
				) : (
					<RepeatOnce
						aria-hidden="true"
						className="size-5"
						weight={context.sentenceRepeatMode === "once" ? "fill" : "regular"}
					/>
				)}
			</PlayerIconButton>
			<PlayerIconButton
				label={nextLabel}
				side={side}
				disabled={!context.canSeekNextSentence}
				onClick={context.onSeekNextSentence}
				className={stepButtonClassName}
			>
				{showStepLabels && (
					<span className="hidden md:inline">{nextLabel}</span>
				)}
				<ArrowRight aria-hidden="true" className="size-5 shrink-0" />
			</PlayerIconButton>
		</fieldset>
	);
}

export function ReadListenModeControls({
	context,
	className,
	buttonClassName,
	side = "top",
}: {
	context: ReadListenPlayerContext;
	className?: string;
	buttonClassName?: string;
	side?: "top" | "bottom";
}) {
	return (
		<fieldset
			className={cn("flex min-w-0 items-center border-0 p-0", className)}
		>
			<legend className="sr-only">{m["read_listen.controls_label"]()}</legend>
			<ReadListenFollowButton
				context={context}
				side={side}
				className={buttonClassName}
			/>
			<ReadListenSentenceSeekButton
				context={context}
				side={side}
				className={buttonClassName}
			/>
		</fieldset>
	);
}

export function ReadListenSentenceSeekButton({
	context,
	className,
	side = "top",
}: {
	context: ReadListenPlayerContext;
	className?: string;
	side?: "top" | "bottom";
}) {
	return (
		<PlayerIconButton
			label={m["read_listen.seek_from_text"]()}
			side={side}
			pressed={context.seekFromText}
			onClick={context.onToggleSeekFromText}
			className={cn(
				context.seekFromText && "bg-accent text-accent-foreground",
				className,
			)}
		>
			<CursorClick
				aria-hidden="true"
				className="size-5"
				weight={context.seekFromText ? "fill" : "regular"}
			/>
		</PlayerIconButton>
	);
}
