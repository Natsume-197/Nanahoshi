import { BookOpenText, Crosshair, CursorClick } from "@phosphor-icons/react";
import { PlayerIconButton } from "@/components/audio-player/player-controls";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

/** Read & Listen contributes context to the player, never playback controls. */
export type ReadListenPlayerContext = {
	statusText: string;
	followText: boolean;
	onToggleFollowText: () => void;
	seekFromText: boolean;
	onToggleSeekFromText: () => void;
};

export function ReadListenOpenButton({
	onOpen,
	className,
	side = "top",
}: {
	onOpen: () => void;
	className?: string;
	side?: "top" | "bottom";
}) {
	return (
		<PlayerIconButton
			label={m["read_listen.open_reader"]()}
			side={side}
			onClick={onOpen}
			className={className}
		>
			<BookOpenText aria-hidden="true" className="size-5" />
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

export function ReadListenControlsGroup({
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
