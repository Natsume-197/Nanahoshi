/**
 * Port of ttu's book-reader-header (BSD-3-Clause, ッツ Reader Authors).
 */

import {
	Bookmark,
	Expand,
	Flag,
	Images,
	List,
	RotateCcw,
	Settings,
	X,
} from "lucide-react";

const baseIconClasses =
	"flex h-12 w-12 cursor-pointer select-none items-center justify-center p-2.5 text-xl opacity-60 transition-opacity hover:opacity-100 xl:h-10 xl:w-10 xl:text-lg";

interface ReaderHeaderProps {
	hasChapterData: boolean;
	/** Shown only in continuous mode (ttu shows the speed there only). */
	autoScrollMultiplier: number | undefined;
	isBookmarkScreen: boolean;
	hasBookmarkData: boolean;
	hasImages: boolean;
	onTocClick: () => void;
	onBookmarkClick: () => void;
	onScrollToBookmarkClick: () => void;
	onCompleteBook: () => void;
	onFullscreenClick: () => void;
	onImageGalleryClick: () => void;
	onSettingsClick: () => void;
	onExitClick: () => void;
}

export function ReaderHeader({
	hasChapterData,
	autoScrollMultiplier,
	isBookmarkScreen,
	hasBookmarkData,
	hasImages,
	onTocClick,
	onBookmarkClick,
	onScrollToBookmarkClick,
	onCompleteBook,
	onFullscreenClick,
	onImageGalleryClick,
	onSettingsClick,
	onExitClick,
}: ReaderHeaderProps) {
	return (
		<div className="relative flex h-12 justify-between bg-gray-700 px-4 text-white md:px-8 xl:h-10">
			<div className="flex -translate-x-4 transform-gpu xl:-translate-x-3">
				{hasChapterData && (
					<button
						type="button"
						title="Open Table of Contents"
						className={baseIconClasses}
						onClick={onTocClick}
					>
						<List className="size-5" />
					</button>
				)}
				<button
					type="button"
					title="Create Bookmark"
					className={baseIconClasses}
					onClick={onBookmarkClick}
				>
					<Bookmark
						className={`size-5 ${isBookmarkScreen ? "fill-current" : ""}`}
					/>
				</button>
				{hasBookmarkData && (
					<button
						type="button"
						title="Return to Bookmark"
						className={baseIconClasses}
						onClick={onScrollToBookmarkClick}
					>
						<RotateCcw className="size-5" />
					</button>
				)}
				{autoScrollMultiplier !== undefined && (
					<div
						className="flex items-center px-4 text-xl xl:px-3 xl:text-lg"
						title="Current Autoscroll Speed"
					>
						{autoScrollMultiplier}x
					</div>
				)}
			</div>

			<div className="flex translate-x-4 transform-gpu xl:translate-x-3">
				<button
					type="button"
					title="Complete Book"
					className={baseIconClasses}
					onClick={onCompleteBook}
				>
					<Flag className="size-5" />
				</button>
				<button
					type="button"
					title="Toggle Fullscreen"
					className={baseIconClasses}
					onClick={onFullscreenClick}
				>
					<Expand className="size-5" />
				</button>
				{hasImages && (
					<button
						type="button"
						title="Open Image Gallery"
						className={baseIconClasses}
						onClick={onImageGalleryClick}
					>
						<Images className="size-5" />
					</button>
				)}
				<button
					type="button"
					title="Open Settings"
					className={baseIconClasses}
					onClick={onSettingsClick}
				>
					<Settings className="size-5" />
				</button>
				<button
					type="button"
					title="Exit Reader"
					className={baseIconClasses}
					onClick={onExitClick}
				>
					<X className="size-5" />
				</button>
			</div>
		</div>
	);
}
