import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	Headphones,
	Maximize2,
	Pause,
	Play,
	SkipBack,
	SkipForward,
	X,
} from "lucide-react";
import { Slider as SliderPrimitive } from "radix-ui";
import { memo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	useAudioPlayerActions,
	useAudioPlayerState,
} from "@/context/audio-player-context";
import { getAccentForegroundColor } from "@/utils/color";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames, formatTime } from "@/utils/format";

export const MiniPlayer = memo(function MiniPlayer() {
	const { audiobook, isPlaying, globalCurrentTime, totalDuration } =
		useAudioPlayerState();
	const { togglePlay, seekTo, seekRelative, stop } = useAudioPlayerActions();
	const navigate = useNavigate();
	const location = useLocation();

	const [isDragging, setIsDragging] = useState(false);
	const [dragValue, setDragValue] = useState(0);
	const commitRef = useRef(seekTo);
	commitRef.current = seekTo;

	if (!audiobook) return null;
	if (location.pathname.startsWith("/player/")) return null;

	const title = audiobook.title ?? audiobook.filename;
	const authorText = formatNames(audiobook.authors);
	const coverFilename = getCoverFilename(audiobook.cover);
	const coverUrl = coverFilename
		? getCoverPresetUrl(coverFilename, coverPresets.thumbnail)
		: null;
	const coverSrcSet = coverFilename
		? getCoverSrcSet(coverFilename, coverPresets.thumbnail.widths)
		: undefined;

	const mainColor = audiobook.mainColor ?? "#1a1a2e";
	const fgColor = getAccentForegroundColor(mainColor);
	const displayTime = isDragging ? dragValue : globalCurrentTime;
	const progress =
		totalDuration > 0 ? (globalCurrentTime / totalDuration) * 100 : 0;

	const handleOpen = () => {
		navigate({
			to: "/player/$uuid",
			params: { uuid: audiobook.uuid },
		});
	};

	return (
		<div
			className="fixed inset-x-0 bottom-14 z-40 md:static md:shrink-0"
			style={{ backgroundColor: mainColor, color: fgColor }}
		>
			{/* ── Mobile layout ── */}
			<div className="md:hidden">
				{/* Thin progress bar */}
				<div className="h-0.5 bg-black/20">
					<div
						className="h-full transition-[width] duration-300"
						style={{ width: `${progress}%`, backgroundColor: fgColor }}
					/>
				</div>
				<div className="flex items-center gap-2 px-2 py-1.5">
					<button
						type="button"
						onClick={handleOpen}
						className="flex min-w-0 flex-1 items-center gap-2"
					>
						<div className="size-10 shrink-0 overflow-hidden rounded bg-black/10">
							{coverUrl ? (
								<img
									src={coverUrl}
									srcSet={coverSrcSet}
									sizes={coverPresets.thumbnail.sizes}
									alt={title}
									className="h-full w-full object-cover"
									loading="eager"
									decoding="async"
								/>
							) : (
								<div className="flex h-full w-full items-center justify-center">
									<Headphones className="size-4 opacity-40" />
								</div>
							)}
						</div>
						<div className="min-w-0 flex-1">
							<p className="truncate font-medium text-sm leading-tight">
								{title}
							</p>
							{authorText && (
								<p className="truncate text-xs leading-tight opacity-70">
									{authorText}
								</p>
							)}
						</div>
					</button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={isPlaying ? "Pause" : "Play"}
						onClick={togglePlay}
						className="size-8 hover:bg-black/10"
						style={{ color: fgColor }}
					>
						{isPlaying ? (
							<Pause className="size-5" />
						) : (
							<Play className="ml-0.5 size-5" />
						)}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Stop"
						onClick={stop}
						className="size-7 opacity-70 hover:bg-black/10 hover:opacity-100"
						style={{ color: fgColor }}
					>
						<X className="size-4" />
					</Button>
				</div>
			</div>

			{/* ── Desktop layout: single row like Spotify ── */}
			<div className="hidden items-center gap-4 px-3 py-2 md:flex">
				{/* Left: Cover + info */}
				<button
					type="button"
					onClick={handleOpen}
					className="flex w-[340px] shrink-0 items-center gap-2"
				>
					<div className="size-14 shrink-0 overflow-hidden rounded bg-black/10">
						{coverUrl ? (
							<img
								src={coverUrl}
								srcSet={coverSrcSet}
								sizes={coverPresets.thumbnail.sizes}
								alt={title}
								className="h-full w-full object-cover"
								loading="eager"
								decoding="async"
							/>
						) : (
							<div className="flex h-full w-full items-center justify-center">
								<Headphones className="size-3.5 opacity-40" />
							</div>
						)}
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate font-medium text-xs leading-tight">
							{title}
						</p>
						{authorText && (
							<p className="truncate text-[11px] leading-tight opacity-70">
								{authorText}
							</p>
						)}
					</div>
				</button>

				{/* Center: controls + seek inline */}
				<div className="flex min-w-0 flex-1 items-center gap-1.5">
					<Button
						variant="ghost"
						size="icon"
						aria-label="Rewind 30s"
						onClick={() => seekRelative(-30)}
						className="size-6 shrink-0 opacity-70 hover:bg-black/10 hover:opacity-100"
						style={{ color: fgColor }}
					>
						<SkipBack className="size-3" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label={isPlaying ? "Pause" : "Play"}
						onClick={togglePlay}
						className="size-7 shrink-0 hover:bg-black/10"
						style={{ color: fgColor }}
					>
						{isPlaying ? (
							<Pause className="size-4" />
						) : (
							<Play className="ml-0.5 size-4" />
						)}
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Forward 30s"
						onClick={() => seekRelative(30)}
						className="size-6 shrink-0 opacity-70 hover:bg-black/10 hover:opacity-100"
						style={{ color: fgColor }}
					>
						<SkipForward className="size-3" />
					</Button>

					{/* Seek bar */}
					<span className="ml-1 w-9 shrink-0 text-right text-[10px] tabular-nums opacity-60">
						{formatTime(displayTime)}
					</span>
					<SliderPrimitive.Root
						min={0}
						max={Math.max(totalDuration, 1)}
						step={1}
						value={[displayTime]}
						onValueChange={([val]) => {
							setIsDragging(true);
							setDragValue(val ?? 0);
						}}
						onValueCommit={([val]) => {
							setIsDragging(false);
							commitRef.current(val ?? 0);
						}}
						className="group relative flex min-w-0 flex-1 touch-none select-none items-center"
					>
						<SliderPrimitive.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-white/20">
							<SliderPrimitive.Range
								className="absolute h-full rounded-full"
								style={{ backgroundColor: fgColor }}
							/>
						</SliderPrimitive.Track>
						<SliderPrimitive.Thumb
							className="block size-0 rounded-full transition-all focus-visible:size-3 focus-visible:outline-hidden group-hover:size-3"
							style={{ backgroundColor: fgColor }}
						/>
					</SliderPrimitive.Root>
					<span className="w-9 shrink-0 text-[10px] tabular-nums opacity-60">
						{formatTime(totalDuration)}
					</span>
				</div>

				{/* Right: Fullscreen + Close */}
				<div className="flex shrink-0 items-center gap-0.5">
					<Button
						variant="ghost"
						size="icon"
						aria-label="Open full player"
						onClick={handleOpen}
						className="size-6 opacity-70 hover:bg-black/10 hover:opacity-100"
						style={{ color: fgColor }}
					>
						<Maximize2 className="size-3" />
					</Button>
					<Button
						variant="ghost"
						size="icon"
						aria-label="Stop"
						onClick={stop}
						className="size-6 opacity-70 hover:bg-black/10 hover:opacity-100"
						style={{ color: fgColor }}
					>
						<X className="size-3" />
					</Button>
				</div>
			</div>
		</div>
	);
});
