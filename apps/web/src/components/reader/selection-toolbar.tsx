import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useReaderState } from "@/context/reader-context";
import { useDocumentEvent } from "@/hooks/use-document-event";

interface SelectionState {
	visible: boolean;
	rect: DOMRect | null;
	paragraphId: number | null;
}

export function SelectionToolbar() {
	const state = useReaderState();
	const [selection, setSelection] = useState<SelectionState>({
		visible: false,
		rect: null,
		paragraphId: null,
	});
	const highlightedIdRef = useRef<number | null>(null);

	const clearHighlight = useCallback(() => {
		const prevId = highlightedIdRef.current;
		if (prevId !== null) {
			const prevP = document.querySelector(
				`p[index="${prevId}"]`,
			) as HTMLElement | null;
			prevP?.style.removeProperty("background-color");
			highlightedIdRef.current = null;
		}
	}, []);

	const getBookmarkIndex = useCallback(
		(id: number): number =>
			state.book.bookmarks.findIndex((b) => b.paragraphId === id),
		[state.book.bookmarks],
	);

	useDocumentEvent("selectionchange", () => {
		const selectionObj = document.getSelection();
		if (!selectionObj || selectionObj.isCollapsed || !selectionObj.rangeCount) {
			clearHighlight();
			setSelection((prev) => ({ ...prev, visible: false }));
			return;
		}

		const anchorParagraph = selectionObj.anchorNode?.parentElement?.closest?.(
			"p[index]",
		) as HTMLElement | null;
		const focusParagraph = selectionObj.focusNode?.parentElement?.closest?.(
			"p[index]",
		) as HTMLElement | null;
		if (
			anchorParagraph &&
			focusParagraph &&
			anchorParagraph !== focusParagraph
		) {
			clearHighlight();
			setSelection((prev) => ({ ...prev, visible: false }));
			return;
		}

		const paragraph = focusParagraph || anchorParagraph;
		if (!paragraph) {
			clearHighlight();
			setSelection((prev) => ({ ...prev, visible: false }));
			return;
		}

		const range = selectionObj.getRangeAt(0);
		const rect = range.getBoundingClientRect();
		const paragraphId = Number(paragraph.getAttribute("index"));

		const prevId = highlightedIdRef.current;
		if (prevId !== null && prevId !== paragraphId) {
			const prevP = document.querySelector(
				`p[index="${prevId}"]`,
			) as HTMLElement | null;
			prevP?.style.removeProperty("background-color");
		}

		paragraph.style.backgroundColor = "var(--color-accent)";
		highlightedIdRef.current = paragraphId;

		setSelection({ visible: true, rect, paragraphId });
	});

	const toggleBookmark = useCallback(() => {
		const { paragraphId } = selection;
		if (paragraphId === null) return;

		const paragraph = document.querySelector(
			`p[index="${paragraphId}"]`,
		) as HTMLElement | null;
		const text = paragraph?.textContent ?? "";

		const idx = getBookmarkIndex(paragraphId);
		if (idx !== -1) {
			state.book.bookmarks.splice(idx, 1);
			toast.info("Bookmark removed");
		} else {
			state.book.bookmarks.push({
				paragraphId,
				sectionName: state.book.sections[state.currSection]?.name ?? "",
				content: text,
			});
			toast.success("Bookmark added");
		}
		state.book.save();
		clearHighlight();
		setSelection((prev) => ({ ...prev, visible: false }));
	}, [selection, state, getBookmarkIndex, clearHighlight]);

	const handleCopy = useCallback(() => {
		const paragraphId = selection.paragraphId;
		if (paragraphId === null) return;

		const paragraph = document.querySelector(`p[index="${paragraphId}"]`);
		const text = paragraph?.textContent ?? "";

		if (!text) {
			toast.error("No content to copy");
			return;
		}

		navigator.clipboard
			.writeText(text)
			.then(() => toast.success("Copied to clipboard"))
			.catch(() => toast.error("Failed to copy"));

		clearHighlight();
		setSelection((prev) => ({ ...prev, visible: false }));
	}, [selection.paragraphId, clearHighlight]);

	if (!selection.visible || !selection.rect) return null;

	const toolbarHeight = 44;
	const gap = 8;
	const rect = selection.rect;
	let top = rect.top - toolbarHeight - gap + window.scrollY;
	const left = rect.left + rect.width / 2 + window.scrollX;

	if (top < window.scrollY + 20) {
		top = rect.bottom + gap + window.scrollY;
	}

	const isBookmarked =
		selection.paragraphId !== null &&
		getBookmarkIndex(selection.paragraphId) !== -1;

	return (
		<div
			id="selection-toolbar"
			className="flex gap-1 rounded-lg border border-border bg-background/95 p-1 shadow-lg backdrop-blur-sm"
			style={{
				position: "absolute",
				top: `${top}px`,
				left: `${left}px`,
				transform: "translateX(-50%)",
				zIndex: 50,
			}}
		>
			<Button variant="ghost" size="sm" onClick={handleCopy}>
				Copy
			</Button>
			<Button variant="ghost" size="sm" onClick={toggleBookmark}>
				{isBookmarked ? "Remove Bookmark" : "Bookmark"}
			</Button>
		</div>
	);
}
