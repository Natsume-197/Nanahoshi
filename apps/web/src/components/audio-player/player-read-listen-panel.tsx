import { BookOpenText, Crosshair } from "@phosphor-icons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	type KeyboardEvent,
	memo,
	type RefObject,
	useRef,
	useState,
} from "react";
import { ReadListenActiveCueFollower } from "@/components/audio-player/read-listen-active-cue-follower";
import { useReadListenPlaybackSession } from "@/components/read-listen/use-read-listen-playback-session";
import { Button } from "@/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/ui/empty";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { resolveReadListenPairingChoice } from "@/lib/read-listen/pairing";
import {
	getReadListenCueDisplayText,
	getReadListenTextEdgePadding,
	scrollReadListenTextByKey,
} from "@/lib/read-listen/synchronized-text";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export type PlayerReadListenPairing = {
	id: string;
	ebookUuid: string;
	ebookTitle: string;
	ebookFilename: string;
};

function SynchronizedTextViewportMeasurement({
	viewportRef,
	onHeightChange,
}: {
	viewportRef: RefObject<HTMLDivElement | null>;
	onHeightChange: (height: number) => void;
}) {
	useMountEffect(() => {
		const viewport = viewportRef.current;
		if (!viewport) return;
		const measure = () => onHeightChange(viewport.clientHeight);
		measure();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(measure);
		observer.observe(viewport);
		return () => observer.disconnect();
	});
	return null;
}

function PlayerReadListenSessionPanel({
	pairing,
}: {
	pairing: PlayerReadListenPairing;
}) {
	const session = useReadListenPlaybackSession({
		pairUuid: pairing.id,
		ebookUuid: pairing.ebookUuid,
	});
	const [followText, setFollowText] = useState(true);
	const [viewportHeight, setViewportHeight] = useState(0);
	const scrollRef = useRef<HTMLDivElement>(null);
	const edgePadding = getReadListenTextEdgePadding(viewportHeight);
	const virtualizer = useVirtualizer({
		count: session.timeline.length,
		getScrollElement: () => scrollRef.current,
		estimateSize: () => 76,
		overscan: 10,
		getItemKey: (index) => session.timeline[index]?.id ?? index,
		paddingStart: edgePadding,
		paddingEnd: edgePadding,
	});

	const handleManualScrollKey = (event: KeyboardEvent<HTMLDivElement>) => {
		const viewport = scrollRef.current;
		if (!viewport) return;
		if (!scrollReadListenTextByKey({ key: event.key, viewport })) return;
		event.preventDefault();
		setFollowText(false);
	};

	if (session.status === "loading") {
		return (
			<div
				role="status"
				className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-muted-foreground text-sm"
			>
				{m["read_listen.reader_loading"]()}
			</div>
		);
	}

	if (session.status === "unavailable") {
		return (
			<Empty className="min-h-0 p-6">
				<EmptyHeader>
					<EmptyTitle>
						{m["read_listen.synchronized_text_unavailable"]()}
					</EmptyTitle>
					<EmptyDescription>
						{m["read_listen.player_unavailable"]()}
					</EmptyDescription>
				</EmptyHeader>
				<Button variant="secondary" size="sm" onClick={session.retry}>
					{m["read_listen.retry_alignment"]()}
				</Button>
			</Empty>
		);
	}

	if (session.timeline.length === 0) {
		return (
			<Empty className="min-h-0 p-6">
				<EmptyHeader>
					<EmptyTitle>
						{m["read_listen.synchronized_text_unavailable"]()}
					</EmptyTitle>
					<EmptyDescription>
						{m["read_listen.synchronized_text_empty_description"]()}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}

	return (
		<div className="relative min-h-0 flex-1">
			<SynchronizedTextViewportMeasurement
				viewportRef={scrollRef}
				onHeightChange={setViewportHeight}
			/>
			<ReadListenActiveCueFollower
				active={
					viewportHeight > 0 &&
					followText &&
					session.activeCueIndex >= 0 &&
					session.activeCue
						? { id: session.activeCue.id, index: session.activeCueIndex }
						: null
				}
				layoutRevision={viewportHeight}
				scrollToIndex={virtualizer.scrollToIndex}
				viewportRef={scrollRef}
			/>
			<section
				ref={scrollRef}
				data-sheet-ignore
				aria-label={m["read_listen.synchronized_text_label"]()}
				// biome-ignore lint/a11y/noNoninteractiveTabindex: the scrollable synchronized-text region needs a keyboard surface for arrow and page navigation
				tabIndex={0}
				onKeyDown={handleManualScrollKey}
				onWheel={() => setFollowText(false)}
				onPointerDown={(event) => {
					if (event.button === 0) setFollowText(false);
				}}
				className="h-full overflow-y-auto overscroll-contain px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:ring-inset"
			>
				<ol
					className="relative m-0 w-full list-none p-0"
					style={{ height: virtualizer.getTotalSize() }}
				>
					{virtualizer.getVirtualItems().map((item) => {
						const cue = session.timeline[item.index];
						if (!cue) return null;
						const text = getReadListenCueDisplayText(cue);
						const isActive = item.index === session.activeCueIndex;
						return (
							<li
								key={item.key}
								aria-posinset={item.index + 1}
								aria-setsize={session.timeline.length}
								data-index={item.index}
								data-read-listen-cue-id={cue.id}
								ref={virtualizer.measureElement}
								className="absolute inset-x-0 top-0 px-1"
								style={{ transform: `translateY(${item.start}px)` }}
							>
								{text ? (
									<button
										type="button"
										aria-current={isActive ? "true" : undefined}
										aria-label={m["read_listen.seek_to_sentence"]({ text })}
										onClick={() => {
											setFollowText(true);
											session.seekToCue(cue);
										}}
										className={cn(
											"min-h-14 w-full rounded-xl px-3 py-3 text-start text-base leading-relaxed outline-none transition-[background-color,color] duration-150 focus-visible:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/70 md:text-lg",
											isActive
												? "bg-foreground/10 font-semibold text-foreground"
												: "text-foreground/70 hover:bg-foreground/5 hover:text-foreground",
										)}
									>
										{text}
									</button>
								) : (
									<button
										type="button"
										aria-current={isActive ? "true" : undefined}
										aria-label={m["read_listen.seek_to_reader_section"]()}
										onClick={() => {
											setFollowText(true);
											session.seekToCue(cue);
										}}
										className={cn(
											"min-h-16 w-full rounded-xl px-3 py-3 text-start text-muted-foreground text-sm leading-relaxed outline-none transition-[background-color,color] duration-150 hover:bg-foreground/5 hover:text-foreground focus-visible:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring/70",
											isActive && "bg-foreground/10",
										)}
									>
										{m["read_listen.fragment_requires_reader"]()}
									</button>
								)}
							</li>
						);
					})}
				</ol>
			</section>

			{!followText && (
				<div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3">
					<Button
						variant="secondary"
						size="lg"
						onClick={() => setFollowText(true)}
						className="pointer-events-auto rounded-full shadow-lg"
					>
						<Crosshair aria-hidden="true" data-icon="inline-start" />
						{m["read_listen.follow_current_text"]()}
					</Button>
				</div>
			)}
		</div>
	);
}

export const PlayerReadListenPanel = memo(function PlayerReadListenPanel({
	pairings,
	selectedPairingId,
	onPairingChange,
	className,
}: {
	pairings: PlayerReadListenPairing[];
	selectedPairingId: string | null;
	onPairingChange: (pairingId: string) => void;
	className?: string;
}) {
	const pairing = resolveReadListenPairingChoice(pairings, selectedPairingId);

	return (
		<section
			aria-label={m["read_listen.title"]()}
			className={cn("flex min-h-0 flex-1 flex-col", className)}
		>
			{pairings.length > 1 && (
				<div className="flex shrink-0 items-center px-2 pb-2">
					<Select
						value={pairing?.id ?? null}
						onValueChange={(value) => onPairingChange(value)}
					>
						<SelectTrigger
							aria-label={m["read_listen.ebook_edition_label"]()}
							className="min-w-0 flex-1"
						>
							<SelectValue>
								{pairing?.ebookTitle ?? m["read_listen.choose_ebook_edition"]()}
							</SelectValue>
						</SelectTrigger>
						<SelectContent position="popper">
							<SelectGroup>
								{pairings.map((candidate) => (
									<SelectItem key={candidate.id} value={candidate.id}>
										{candidate.ebookTitle || candidate.ebookFilename}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
				</div>
			)}

			{pairing ? (
				<PlayerReadListenSessionPanel key={pairing.id} pairing={pairing} />
			) : (
				<Empty className="min-h-0 p-6">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<BookOpenText aria-hidden="true" />
						</EmptyMedia>
						<EmptyTitle>{m["read_listen.choose_ebook_edition"]()}</EmptyTitle>
						<EmptyDescription>
							{m["read_listen.choose_ebook_edition_description"]()}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</section>
	);
});
