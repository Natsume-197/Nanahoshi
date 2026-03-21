import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { useReaderDispatch, useReaderState } from "@/context/reader-context";
import { useWindowEvent } from "@/hooks/use-window-event";

const KEYMAPS = [
	{ key: "?", description: "Show keyboard shortcuts" },
	{ key: "b", description: "Go to last saved bookmark" },
	{ key: "Esc", description: "Close modal / navbar" },
	{ key: "←/→", description: "Navigate pages" },
	{ key: "↑/↓", description: "Navigate pages" },
	{ key: "PgUp/PgDn", description: "Navigate pages" },
];

export function KeymapManager() {
	const [modalOpen, setModalOpen] = useState(false);
	const state = useReaderState();
	const dispatch = useReaderDispatch();

	const handleKeydown = useCallback(
		(e: KeyboardEvent) => {
			if (e.key === "?") {
				e.preventDefault();
				setModalOpen(true);
			}

			if (e.key === "b") {
				const bookmarks = state.book.bookmarks;
				if (bookmarks.length > 0) {
					e.preventDefault();
					dispatch.bookmarkGoTo(bookmarks[bookmarks.length - 1]);
				}
			}

			if (e.key === "Escape") {
				if (modalOpen) {
					setModalOpen(false);
				} else {
					dispatch.closeNavbar();
					dispatch.setSidebar(null);
				}
			}
		},
		[state.book.bookmarks, dispatch, modalOpen],
	);

	useWindowEvent("keydown", handleKeydown);

	if (!modalOpen) return null;

	return (
		<div
			className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
			onClick={() => setModalOpen(false)}
			onKeyDown={() => {}}
		>
			<div
				className="min-w-[300px] rounded-lg border border-border bg-background p-6 shadow-lg"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={() => {}}
			>
				<div className="mb-4 flex items-center justify-between">
					<h4 className="font-bold text-lg">Keyboard Shortcuts</h4>
					<button
						type="button"
						onClick={() => setModalOpen(false)}
						className="rounded-md p-1 text-muted-foreground hover:text-foreground"
					>
						<X className="size-4" strokeWidth={1.5} />
					</button>
				</div>
				<ul className="space-y-2">
					{KEYMAPS.map((km) => (
						<li key={km.key} className="flex items-center">
							<span className="rounded bg-muted px-2 py-1 font-mono text-sm">
								{km.key}
							</span>
							<span className="ml-3 text-sm">{km.description}</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
