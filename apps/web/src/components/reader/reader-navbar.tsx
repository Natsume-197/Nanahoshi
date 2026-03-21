import {
	Bookmark,
	BookOpenText,
	Maximize,
	Minimize,
	Settings,
	X,
} from "lucide-react";
import { useCallback, useState } from "react";
import {
	useReaderDispatch,
	useReaderState,
	useReaderUI,
} from "@/context/reader-context";
import { cn } from "@/lib/utils";

interface ReaderNavbarProps {
	onExit: () => void;
}

export function ReaderNavbar({ onExit }: ReaderNavbarProps) {
	const { book } = useReaderState();
	const { navOpen } = useReaderUI();
	const dispatch = useReaderDispatch();
	const [isFullscreen, setIsFullscreen] = useState(false);

	const goToLastBookmark = useCallback(() => {
		const bookmarks = book.bookmarks;
		if (bookmarks.length === 0) return;
		dispatch.bookmarkGoTo(bookmarks[bookmarks.length - 1]);
	}, [book.bookmarks, dispatch]);

	const toggleFullscreen = useCallback(() => {
		if (document.fullscreenElement) {
			document.exitFullscreen();
			setIsFullscreen(false);
		} else {
			document.documentElement.requestFullscreen();
			setIsFullscreen(true);
		}
		dispatch.closeNavbar();
	}, [dispatch]);

	return (
		<>
			{/* Invisible trigger zone at top of screen */}
			<button
				type="button"
				onClick={() => dispatch.openNavbar()}
				className="fixed top-0 right-0 left-0 z-10 h-12 cursor-pointer bg-transparent"
			/>

			{/* Navbar overlay */}
			{navOpen && (
				<nav className="fixed top-0 right-0 left-0 z-50 flex items-center justify-between border-border border-b bg-background/95 px-4 py-2 backdrop-blur-sm">
					<div className="flex items-center gap-2">
						<NavButton
							onClick={() => dispatch.setSidebar("toc")}
							title="Table of Contents"
						>
							<BookOpenText className="size-5" strokeWidth={1.5} />
						</NavButton>
						<NavButton
							onClick={() => dispatch.setSidebar("bookmarks")}
							title="Bookmarks"
						>
							<Bookmark className="size-5" strokeWidth={1.5} />
						</NavButton>
						{book.bookmarks.length > 0 && (
							<NavButton onClick={goToLastBookmark} title="Go to last bookmark">
								<Bookmark className="size-5 fill-current" strokeWidth={1.5} />
							</NavButton>
						)}
					</div>

					<div className="flex items-center gap-2">
						<NavButton
							onClick={toggleFullscreen}
							title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
						>
							{isFullscreen ? (
								<Minimize className="size-5" strokeWidth={1.5} />
							) : (
								<Maximize className="size-5" strokeWidth={1.5} />
							)}
						</NavButton>
						<NavButton
							onClick={() => dispatch.setSidebar("settings")}
							title="Settings"
						>
							<Settings className="size-5" strokeWidth={1.5} />
						</NavButton>
						<NavButton onClick={onExit} title="Exit reader">
							<X className="size-5" strokeWidth={1.5} />
						</NavButton>
					</div>
				</nav>
			)}
		</>
	);
}

function NavButton({
	onClick,
	title,
	children,
	className,
}: {
	onClick: () => void;
	title: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			title={title}
			className={cn(
				"flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
				className,
			)}
		>
			{children}
		</button>
	);
}
