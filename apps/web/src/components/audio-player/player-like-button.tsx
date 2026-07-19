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

/**
 * Like heart sitting next to the now-playing title. Self-contained (reads the
 * active book from context) so it can be dropped into the shared title row of
 * both the mobile and desktop layouts. The mini player only plays audiobooks,
 * so the like is always scoped to the "audiobook" media type.
 */
export const PlayerLikeButton = memo(function PlayerLikeButton({
	className,
}: {
	className?: string;
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
							? "text-destructive hover:text-destructive"
							: "text-muted-foreground hover:text-foreground",
						className,
					)}
				>
					<Heart
						ref={heartRef}
						weight={isLiked ? "fill" : "regular"}
						className="size-4"
					/>
				</Button>
			</TooltipTrigger>
			<TooltipContent side="top" sideOffset={8}>
				{label}
			</TooltipContent>
		</Tooltip>
	);
});
