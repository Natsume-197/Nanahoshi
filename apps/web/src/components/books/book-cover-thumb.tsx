import { Link } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";

interface BookCoverThumbProps {
	bookUuid: string;
	cover: string | null;
	title?: string | null;
	/** Sizing / extra classes applied to the cover frame (e.g. `w-[64px]`). */
	className?: string;
	/** Size class for the fallback "no cover" icon. */
	iconClassName?: string;
	/** Preload the book detail route on intent. */
	preload?: boolean;
}

/**
 * Small book-cover tile linking to the book detail page, with a graceful
 * "no cover" fallback. Shared by the activity feed and the profile shelves so
 * the cover-URL handling and fallback live in one place.
 */
export function BookCoverThumb({
	bookUuid,
	cover,
	title,
	className,
	iconClassName,
	preload,
}: BookCoverThumbProps) {
	const coverFilename = getCoverFilename(cover) ?? undefined;
	const label = title ?? m["book.untitled"]();
	return (
		<Link
			to="/dashboard/books/$uuid"
			params={{ uuid: bookUuid }}
			preload={preload ? "intent" : undefined}
			aria-label={label}
			title={label}
			className={cn(
				"group relative block aspect-[2/3] overflow-hidden rounded-sm bg-muted ring-1 ring-border",
				className,
			)}
		>
			{coverFilename ? (
				<img
					src={getCoverPresetUrl(coverFilename, coverPresets.activity)}
					srcSet={getCoverSrcSet(coverFilename, coverPresets.activity.widths)}
					sizes={coverPresets.activity.sizes}
					alt=""
					className="absolute inset-0 h-full w-full object-cover"
					loading="lazy"
					decoding="async"
				/>
			) : (
				<span className="absolute inset-0 flex items-center justify-center text-muted-foreground">
					<BookOpen className={cn("size-4 opacity-60", iconClassName)} />
				</span>
			)}
		</Link>
	);
}
