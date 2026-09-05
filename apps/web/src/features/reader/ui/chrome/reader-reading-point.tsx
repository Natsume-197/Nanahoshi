import { BookmarkSimple, MapPin } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReaderPosition, Section } from "@/features/reader/document/types";
import type { ReaderTheme } from "@/features/reader/presentation/settings";
import {
	rangeForReadingPoint,
	readingPointForSelection,
} from "@/features/reader/session/reading-point-dom";
import { m } from "@/paraglide/messages";

interface Props {
	position?: ReaderPosition;
	sections: readonly Section[];
	total: number;
	renderer: string;
	theme: ReaderTheme;
	onSave: (position?: ReaderPosition) => void;
	onGo: () => void;
}

export function ReaderReadingPoint({
	position,
	sections,
	total,
	renderer,
	theme,
	onSave,
	onGo,
}: Props) {
	const [selection, setSelection] = useState<ReaderPosition>();
	const markerRef = useRef<HTMLSpanElement>(null);
	const [toolbar, setToolbar] = useState<Element | null>(null);
	useEffect(() => {
		const update = () => {
			const selected = window.getSelection();
			const root = document.querySelector(
				`[data-reader-renderer="${renderer}"]`,
			);
			if (!selected?.rangeCount || selected.isCollapsed || !root) {
				setSelection(undefined);
				return;
			}
			setSelection(
				readingPointForSelection(selected.getRangeAt(0), root, sections, total),
			);
		};
		document.addEventListener("selectionchange", update);
		return () => document.removeEventListener("selectionchange", update);
	}, [renderer, sections, total]);

	useEffect(() => {
		const surface = document.querySelector("main");
		if (!surface) return;
		let root: Element | null = null;
		let range: Range | undefined;
		let frame = 0;
		const paint = () => {
			frame = 0;
			const marker = markerRef.current;
			if (!marker) return;
			let rect = range?.getBoundingClientRect();
			if (root && position && renderer === "visual") {
				const index = sections.findIndex(
					(section) => section.reference === position.locator?.sectionReference,
				);
				rect = root
					.querySelector(`[data-visual-page-index="${index}"]`)
					?.getBoundingClientRect();
			} else if (root && position && renderer === "pdf") {
				rect = root
					.querySelector(
						`[data-reader-pdf-page="${position.exploredCharCount}"]`,
					)
					?.getBoundingClientRect();
			}
			const viewport = root?.closest("main")?.getBoundingClientRect();
			const visible =
				rect &&
				(rect.width > 0 || rect.height > 0) &&
				rect.bottom > (viewport?.top ?? 0) &&
				rect.top < (viewport?.bottom ?? window.innerHeight) &&
				rect.right > 0 &&
				rect.left < window.innerWidth;
			marker.hidden = !visible;
			if (!visible || !rect || !root) return;
			const vertical =
				getComputedStyle(root).writingMode.startsWith("vertical");
			const page = renderer === "visual" || renderer === "pdf";
			// Keep the marker attached to the source, including at viewport edges.
			marker.style.left = `${page ? rect.right - 26 : vertical ? rect.right + 3 : rect.left - 25}px`;
			marker.style.top = `${rect.top}px`;
		};
		const schedule = () => {
			if (!frame) frame = requestAnimationFrame(paint);
		};
		const resize = new ResizeObserver(schedule);
		const refresh = (records?: MutationRecord[]) => {
			setToolbar(surface.querySelector("[data-reader-point-actions]"));
			const nextRoot = surface.querySelector(
				`[data-reader-renderer="${renderer}"]`,
			);
			const changedRoot = nextRoot !== root;
			if (changedRoot) {
				resize.disconnect();
				root = nextRoot;
				if (root) resize.observe(root);
			}
			if (
				!records ||
				changedRoot ||
				records.some((record) => root?.contains(record.target))
			) {
				range =
					root && position
						? rangeForReadingPoint(root, position, sections)
						: undefined;
				schedule();
			}
		};
		// Renderers can mount late or replace their content during reflow.
		const observer = new MutationObserver(refresh);
		observer.observe(surface, {
			childList: true,
			characterData: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["data-reader-character-start", "style"],
		});
		document.addEventListener("scroll", schedule, true);
		window.addEventListener("resize", schedule);
		document.addEventListener("load", schedule, true);
		refresh();
		paint();
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			resize.disconnect();
			document.removeEventListener("scroll", schedule, true);
			window.removeEventListener("resize", schedule);
			document.removeEventListener("load", schedule, true);
		};
	}, [position, renderer, sections]);

	const buttonClass =
		"flex size-10 shrink-0 items-center justify-center rounded-md opacity-70 hover:bg-black/10 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-30";
	return (
		<>
			{createPortal(
				<span
					ref={markerRef}
					hidden
					aria-label={m.reader_point_marker()}
					role="img"
					className="pointer-events-none fixed z-[8]"
					style={{ color: theme.fontColor }}
				>
					<BookmarkSimple weight="fill" size={22} />
				</span>,
				document.body,
			)}
			{toolbar &&
				createPortal(
					<div className="flex items-center" data-reader-position-overlay>
						<button
							type="button"
							className={buttonClass}
							title={`${m.reader_point_save()} (B)`}
							aria-label={m.reader_point_save()}
							aria-keyshortcuts="b"
							onClick={() => onSave()}
						>
							<BookmarkSimple aria-hidden size={18} />
							<span className="sr-only">{m.reader_point_save()}</span>
						</button>
						<button
							type="button"
							className={buttonClass}
							disabled={!position}
							title={`${m.reader_point_go()} (R)`}
							aria-label={m.reader_point_go()}
							aria-keyshortcuts="r"
							onClick={onGo}
						>
							<MapPin aria-hidden size={18} />
							<span className="sr-only">{m.reader_point_go()}</span>
						</button>
						{selection && (
							<button
								type="button"
								className={buttonClass}
								title={m.reader_point_selection()}
								aria-label={m.reader_point_selection()}
								onPointerDown={(event) => event.preventDefault()}
								onClick={() => {
									onSave(selection);
									window.getSelection()?.removeAllRanges();
									setSelection(undefined);
								}}
							>
								<BookmarkSimple aria-hidden weight="fill" size={18} />
								<span className="sr-only">{m.reader_point_selection()}</span>
							</button>
						)}
					</div>,
					toolbar,
				)}
		</>
	);
}
