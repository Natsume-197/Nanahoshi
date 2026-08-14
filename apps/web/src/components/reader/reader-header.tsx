/**
 * Reader menu bar. Behavior ported from ttu's book-reader-header
 * (BSD-3-Clause, ッツ Reader Authors); chrome restyled to Nanahoshi's
 * language: colors derive from the active reading theme, hairline borders,
 * 300ms ease-out slide like the dashboard's activity rail.
 */

import {
	ArrowCounterClockwise,
	ArrowsOut,
	BookmarkSimple,
	BookOpenText,
	DotsThreeVertical,
	Flag,
	Images,
	List,
	MagnifyingGlass,
	SlidersHorizontal,
	X,
} from "@phosphor-icons/react";
import {
	type CSSProperties,
	type ReactNode,
	useId,
	useRef,
	useState,
} from "react";
import type { ReaderTheme } from "@/lib/reader/settings";
import { m } from "@/paraglide/messages";

interface ReaderHeaderProps {
	open: boolean;
	onOpen: () => void;
	theme: ReaderTheme;
	bookTitle: string;
	hasChapterData: boolean;
	isBookmarkScreen: boolean;
	hasBookmarkData: boolean;
	hasImages: boolean;
	searchAvailable: boolean;
	onTocClick: () => void;
	onBookmarkClick: () => void;
	onScrollToBookmarkClick: () => void;
	onCompleteBook: () => void;
	onFullscreenClick: () => void;
	onImageGalleryClick: () => void;
	onSearchClick: () => void;
	onQuickSettingsClick: () => void;
	readListenAvailable: boolean;
	readListenActive: boolean;
	onReadListenClick: () => void;
	onExitClick: () => void;
}

const iconButtonClasses =
	"flex size-11 shrink-0 touch-manipulation cursor-pointer select-none items-center justify-center rounded-md opacity-70 transition-[background-color,opacity,scale] duration-150 hover:bg-[var(--rh-hover)] hover:opacity-100 focus-visible:outline-offset-2 active:scale-[0.96] max-[22rem]:size-10 sm:size-10";

function IconButton({
	title,
	onClick,
	className = "",
	pressed,
	ariaLabel,
	expanded,
	controls,
	children,
}: {
	title: string;
	onClick: () => void;
	className?: string;
	pressed?: boolean;
	ariaLabel?: string;
	expanded?: boolean;
	controls?: string;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			title={title}
			aria-label={ariaLabel ?? title}
			aria-pressed={pressed}
			aria-expanded={expanded}
			aria-controls={controls}
			className={`${iconButtonClasses} ${pressed ? "bg-[var(--rh-hover)] opacity-100" : ""} ${className}`}
			onClick={onClick}
		>
			{children}
		</button>
	);
}

export function ReaderHeader({
	open,
	onOpen,
	theme,
	bookTitle,
	hasChapterData,
	isBookmarkScreen,
	hasBookmarkData,
	hasImages,
	searchAvailable,
	onTocClick,
	onBookmarkClick,
	onScrollToBookmarkClick,
	onCompleteBook,
	onFullscreenClick,
	onImageGalleryClick,
	onSearchClick,
	onQuickSettingsClick,
	readListenAvailable,
	readListenActive,
	onReadListenClick,
	onExitClick,
}: ReaderHeaderProps) {
	// Secondary actions collapse into this menu below `sm`.
	const [moreOpen, setMoreOpen] = useState(false);
	const moreMenuId = useId();
	// The bar stays mounted while hidden; don't reopen with a stale menu.
	const prevOpenRef = useRef(open);
	if (open !== prevOpenRef.current) {
		prevOpenRef.current = open;
		if (!open && moreOpen) setMoreOpen(false);
	}

	// Neutrals mixed in oklab (oklch turns them brown).
	const mix = (pct: number) =>
		`color-mix(in oklab, ${theme.fontColor} ${pct}%, ${theme.backgroundColor})`;

	const closeMoreAnd = (action: () => void) => () => {
		setMoreOpen(false);
		action();
	};

	const secondaryActions: {
		title: string;
		icon: ReactNode;
		onClick: () => void;
	}[] = [
		{
			title: "Complete Book",
			icon: <Flag aria-hidden="true" className="size-5" />,
			onClick: onCompleteBook,
		},
		{
			title: "Toggle Fullscreen",
			icon: <ArrowsOut aria-hidden="true" className="size-5" />,
			onClick: onFullscreenClick,
		},
		...(hasImages
			? [
					{
						title: "Open Image Gallery",
						icon: <Images aria-hidden="true" className="size-5" />,
						onClick: onImageGalleryClick,
					},
				]
			: []),
	];

	return (
		<>
			{!open && (
				<button
					type="button"
					aria-label="Show reader menu"
					className="writing-horizontal-tb fixed top-0 right-0 left-0 z-10 h-[calc(2rem+var(--safe-area-top))]"
					onClick={onOpen}
				/>
			)}
			<div
				data-reader-header
				inert={!open}
				className={`writing-horizontal-tb fixed top-0 right-0 left-0 z-10 transition-transform duration-300 ease-out motion-reduce:transition-none ${
					open ? "translate-y-0" : "-translate-y-full"
				}`}
			>
				<div
					className="relative flex h-[calc(3.25rem+var(--safe-area-top))] items-center justify-between border-b pt-[var(--safe-area-top)] pr-[max(0.5rem,var(--safe-area-right))] pl-[max(0.5rem,var(--safe-area-left))] shadow-md sm:h-[calc(3rem+var(--safe-area-top))] md:pr-[max(1rem,var(--safe-area-right))] md:pl-[max(1rem,var(--safe-area-left))]"
					style={
						{
							color: theme.fontColor,
							backgroundColor: theme.backgroundColor,
							borderColor: mix(12),
							"--rh-hover": mix(8),
						} as CSSProperties
					}
				>
					<div className="flex min-w-0 items-center">
						{hasChapterData && (
							<IconButton title="Open Table of Contents" onClick={onTocClick}>
								<List aria-hidden="true" className="size-5" />
							</IconButton>
						)}
						<IconButton title="Create Bookmark" onClick={onBookmarkClick}>
							<BookmarkSimple
								aria-hidden="true"
								weight={isBookmarkScreen ? "fill" : "regular"}
								className="size-5"
							/>
						</IconButton>
						{hasBookmarkData && (
							<IconButton
								title="Return to Bookmark"
								onClick={onScrollToBookmarkClick}
							>
								<ArrowCounterClockwise aria-hidden="true" className="size-5" />
							</IconButton>
						)}
						{searchAvailable && (
							<IconButton title="Search this PDF" onClick={onSearchClick}>
								<MagnifyingGlass aria-hidden="true" className="size-5" />
							</IconButton>
						)}
					</div>

					{/* Absolutely centered so it never shifts as side clusters change. */}
					<div className="pointer-events-none absolute inset-x-0 hidden justify-center md:flex">
						<span className="max-w-[38%] truncate font-medium text-sm opacity-80">
							{bookTitle}
						</span>
					</div>

					<div className="flex items-center">
						{readListenAvailable && (
							<IconButton
								title={
									readListenActive
										? m["read_listen.disable_reader"]()
										: m["read_listen.enable_reader"]()
								}
								pressed={readListenActive}
								ariaLabel={m["read_listen.title"]()}
								onClick={onReadListenClick}
							>
								<BookOpenText
									aria-hidden="true"
									className="size-5"
									weight={readListenActive ? "fill" : "regular"}
								/>
							</IconButton>
						)}
						{secondaryActions.map((action) => (
							<IconButton
								key={action.title}
								title={action.title}
								onClick={action.onClick}
								className="hidden sm:flex"
							>
								{action.icon}
							</IconButton>
						))}
						<div className="relative sm:hidden">
							<IconButton
								title="More Actions"
								expanded={moreOpen}
								controls={moreMenuId}
								onClick={() => setMoreOpen((prev) => !prev)}
							>
								<DotsThreeVertical aria-hidden="true" className="size-5" />
							</IconButton>
							{moreOpen && (
								<div
									id={moreMenuId}
									className="fade-in slide-in-from-top-1 absolute end-0 z-20 mt-1 flex w-52 animate-in flex-col rounded-md border py-1 shadow-lg duration-150 motion-reduce:animate-none"
									style={{
										color: theme.fontColor,
										backgroundColor: theme.backgroundColor,
										borderColor: mix(15),
									}}
								>
									{secondaryActions.map((action) => (
										<button
											key={action.title}
											type="button"
											className="flex h-11 cursor-pointer items-center gap-3 px-3 text-sm opacity-80 transition-colors duration-150 hover:bg-[var(--rh-hover)] hover:opacity-100"
											onClick={closeMoreAnd(action.onClick)}
										>
											{action.icon}
											{action.title}
										</button>
									))}
								</div>
							)}
						</div>
						<IconButton
							title="Open Quick Settings"
							onClick={onQuickSettingsClick}
						>
							<SlidersHorizontal aria-hidden="true" className="size-5" />
						</IconButton>
						<IconButton title="Exit Reader" onClick={onExitClick}>
							<X aria-hidden="true" className="size-5" />
						</IconButton>
					</div>
				</div>
			</div>
		</>
	);
}
