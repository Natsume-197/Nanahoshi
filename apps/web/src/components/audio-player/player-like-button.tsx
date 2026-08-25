import { Heart } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { memo } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAudioPlayerBook } from "@/context/audio-player-context";
import { useToggleLike } from "@/hooks/books/use-toggle-like";
import { usePop } from "@/hooks/use-pop";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

/** Like heart for the now-playing title; reads the active book from context. */
export const PlayerLikeButton = memo(function PlayerLikeButton({
	className,
	iconClassName,
}: {
	className?: string;
	/** The heart carries its own size; growing the button alone won't do it. */
	iconClassName?: string;
}) {
	const audiobook = useAudioPlayerBook();
	const bookUuid = audiobook?.uuid ?? "";

	const likeStatusQuery = useQuery({
		...orpc.likedBooks.getLikeStatus.queryOptions({ input: { bookUuid } }),
		enabled: bookUuid !== "",
	});
	const toggleLike = useToggleLike(bookUuid, "audiobook");
	const isLiked = likeStatusQuery.data?.liked ?? false;
	const { ref: heartRef, pop: popHeart } = usePop<SVGSVGElement>();

	if (!bookUuid) return null;

	const label = isLiked
		? m["aria.remove_from_likes"]()
		: m["aria.add_to_likes"]();

	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					aria-label={label}
					aria-pressed={isLiked}
					disabled={toggleLike.isPending || likeStatusQuery.isLoading}
					onClick={() => {
						if (!isLiked) popHeart();
						toggleLike.mutate();
					}}
					className={cn(
						"size-6 shrink-0",
						isLiked
							? "text-white hover:text-white"
							: "text-muted-foreground hover:text-foreground",
						className,
					)}
				>
					<Heart
						ref={heartRef}
						weight={isLiked ? "fill" : "regular"}
						className={cn("size-4", iconClassName)}
					/>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={8}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
});
