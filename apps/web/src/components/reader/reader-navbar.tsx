import {
	Bookmark,
	BookOpenText,
	Maximize,
	Minimize,
	Settings,
	X,
} from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	useReaderDispatch,
	useReaderState,
	useReaderUI,
} from "@/context/reader-context";

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
						<Button
							variant="ghost"
							size="icon"
							onClick={() => dispatch.setSidebar("toc")}
							title="Table of Contents"
						>
							<BookOpenText className="size-5" strokeWidth={1.5} />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => dispatch.setSidebar("bookmarks")}
							title="Bookmarks"
						>
							<Bookmark className="size-5" strokeWidth={1.5} />
						</Button>
						{book.bookmarks.length > 0 && (
							<Button
								variant="ghost"
								size="icon"
								onClick={goToLastBookmark}
								title="Go to last bookmark"
							>
								<Bookmark className="size-5 fill-current" strokeWidth={1.5} />
							</Button>
						)}
					</div>

					<div className="flex items-center gap-2">
						<Button
							variant="ghost"
							size="icon"
							onClick={toggleFullscreen}
							title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
						>
							{isFullscreen ? (
								<Minimize className="size-5" strokeWidth={1.5} />
							) : (
								<Maximize className="size-5" strokeWidth={1.5} />
							)}
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={() => dispatch.setSidebar("settings")}
							title="Settings"
						>
							<Settings className="size-5" strokeWidth={1.5} />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							onClick={onExit}
							title="Exit reader"
						>
							<X className="size-5" strokeWidth={1.5} />
						</Button>
					</div>
				</nav>
			)}
		</>
	);
}
