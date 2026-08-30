import { Crosshair, CursorClick } from "@phosphor-icons/react";
import { PlayerIconButton } from "@/components/audio-player/player-controls";
import { ReadListenIcon } from "@/components/read-listen/read-listen-icon";
import type { ReaderThemeColors } from "@/features/reader/presentation/settings";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

/** Read & Listen contributes context to the player, never playback controls. */
export type ReadListenPlayerContext = {
	readerTheme?: Pick<ReaderThemeColors, "backgroundColor" | "fontColor">;
	statusText: string;
	onExitReadListen: () => void;
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
			<ReadListenIcon
				aria-hidden="true"
				className="size-5"
				weight={pressed ? "bold" : "regular"}
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
			label={
				context.followText
					? m["read_listen.follow_text"]()
					: m["read_listen.return_to_narration"]()
			}
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
