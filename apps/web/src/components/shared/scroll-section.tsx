import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Link, useRouter } from "@tanstack/react-router";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { getLocationRestoreKey, railScroll } from "@/lib/scroll-restoration";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

interface ScrollSectionProps {
	/** Omit to render a headerless section (e.g. the top-of-home Continue grid). */
	title?: ReactNode;
	showAllHref?: string;
	/** History state for the "Show all" link (e.g. { format: "audiobooks" }). */
	showAllState?: Record<string, unknown>;
	headerAction?: ReactNode;
	/**
	 * "resume" lays wide (horizontal) cards one/two/three across so a row of
	 * only two or three items still fills the panel. Overflow still scrolls.
	 */
	layout?: "carousel" | "resume";
	/**
	 * Stable id for carousel scroll restoration. When set, the rail's
	 * scrollLeft is saved per history entry and restored on back/forward.
	 * Skeleton instances must NOT pass one, or they'd clobber the real
	 * rail's saved offset.
	 */
	restoreId?: string;
	children: ReactNode;
}

interface ScrollState {
	canScrollLeft: boolean;
	canScrollRight: boolean;
}

export function ScrollSection({
	title,
	showAllHref,
	showAllState,
	headerAction,
	layout = "carousel",
	restoreId,
	children,
}: ScrollSectionProps) {
	const router = useRouter();
	const isResume = layout === "resume";
	// Nudged up toward the covers: the arrows should sit on the artwork, not on
	// the title/author block stacked beneath it. Wide cards put the text beside
	// the cover, so there the row's own centre is already the cover's centre.
	const arrowTopClass = isResume ? "top-1/2" : "top-[calc(50%-1.5rem)]";
	const scrollElRef = useRef<HTMLDivElement | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const [scrollState, setScrollState] = useState<ScrollState>({
		canScrollLeft: false,
		canScrollRight: false,
	});

	const updateScrollState = useCallback((el: HTMLDivElement) => {
		const nextState = {
			canScrollLeft: el.scrollLeft > 2,
			canScrollRight: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
		};
		setScrollState((prev) =>
			prev.canScrollLeft === nextState.canScrollLeft &&
			prev.canScrollRight === nextState.canScrollRight
				? prev
				: nextState,
		);
	}, []);

	// Ref callback: setup observers on attach, cleanup on detach
	const scrollRef = useCallback(
		(node: HTMLDivElement | null) => {
			// Cleanup previous
			cleanupRef.current?.();
			cleanupRef.current = null;
			scrollElRef.current = node;

			if (!node) return;

			// Restore before first paint (ref callbacks run during the React
			// commit). Keyed by the history entry this rail mounted under, so
			// back/forward lands on the exact horizontal offset it was left at.
			const locationKey = restoreId
				? getLocationRestoreKey(router.latestLocation)
				: null;
			if (restoreId && locationKey) {
				const saved = railScroll.get(locationKey, restoreId);
				if (saved) node.scrollLeft = saved;
			}

			let rafId = 0;
			const onScroll = () => {
				if (rafId) return;
				rafId = requestAnimationFrame(() => {
					rafId = 0;
					updateScrollState(node);
					if (restoreId && locationKey) {
						railScroll.set(locationKey, restoreId, node.scrollLeft);
					}
				});
			};

			updateScrollState(node);
			node.addEventListener("scroll", onScroll, { passive: true });
			const observer = new ResizeObserver(() => updateScrollState(node));
			observer.observe(node);

			cleanupRef.current = () => {
				cancelAnimationFrame(rafId);
				node.removeEventListener("scroll", onScroll);
				observer.disconnect();
				// clientWidth 0 = display:none twin (home keeps hidden format
				// panels mounted); its scrollLeft reads 0 and must not clobber
				// the visible rail's saved offset.
				if (restoreId && locationKey && node.clientWidth > 0) {
					railScroll.set(locationKey, restoreId, node.scrollLeft);
				}
			};
		},
		[updateScrollState, restoreId, router],
	);

	const scroll = useCallback((direction: "left" | "right") => {
		const el = scrollElRef.current;
		if (!el) return;
		const amount = el.clientWidth * 0.75;
		el.scrollBy({
			left: direction === "left" ? -amount : amount,
			behavior: "smooth",
		});
	}, []);

	// The negative margin cancels the page's own inline margin so the rail bleeds
	// to the panel edge, then each row re-applies it: items and header line up
	// with the rest of the page while the overflow runs edge to edge. Both sides
	// move together — a fixed trailing pad would drift off the page margin.
	return (
		<section className="group/section relative -mx-4 md:-mx-6 lg:-mx-8">
			{title != null && (
				<div className="mb-4 flex items-center justify-between gap-3 px-4 md:px-6 lg:px-8">
					<h2 className="min-w-0 truncate font-bold text-[1.375rem]">
						{title}
					</h2>
					<div className="flex shrink-0 items-center gap-2">
						{headerAction}
						{showAllHref && (
							<Link
								to={showAllHref}
								state={showAllState}
								className="font-semibold text-muted-foreground text-sm transition-colors hover:text-foreground"
							>
								{m["nav.show_all"]()}
							</Link>
						)}
					</div>
				</div>
			)}
			<div className="@container relative">
				{scrollState.canScrollLeft && (
					<div className="pointer-events-none absolute inset-y-0 left-0 z-[5] hidden w-20 bg-gradient-to-r from-background/50 to-transparent md:block" />
				)}
				{scrollState.canScrollRight && (
					<div className="pointer-events-none absolute inset-y-0 right-0 z-[5] hidden w-20 bg-gradient-to-l from-background/50 to-transparent md:block" />
				)}

				{scrollState.canScrollLeft && (
					<button
						type="button"
						onClick={() => scroll("left")}
						aria-label={m["scroll.left"]()}
						className={`absolute ${arrowTopClass} left-3 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 shadow-lg ring-1 ring-border backdrop-blur-sm transition-all hover:scale-110 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:flex md:opacity-0 md:group-hover/section:opacity-100 md:focus-visible:opacity-100`}
					>
						<CaretLeft className="size-4" />
					</button>
				)}
				{/* touch-action pan-x pan-y: the browser locks the gesture direction at
				    its start — a horizontal swipe pans the carousel (its only overflow
				    axis), while a vertical swipe has no vertical overflow here and so
				    bubbles up to scroll the page. `pan-x` alone would swallow vertical
				    swipes entirely, trapping page scroll on touch. */}
				<div
					ref={scrollRef}
					className={cn(
						"scrollbar-none overflow-x-auto overscroll-x-contain px-4 py-1 [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] md:px-6 md:py-2 lg:px-8",
						isResume
							? // The third column only appears once it can still leave the title
								// a readable measure beside the cover (~17rem of text).
								"grid @[42rem]:auto-cols-[calc((100%-1rem)/2)] @[75rem]:auto-cols-[calc((100%-2rem)/3)] auto-cols-[100%] grid-flow-col grid-rows-1 gap-3 md:gap-4"
							: "flex gap-3 md:gap-4 lg:gap-4",
					)}
				>
					{children}
				</div>
				{scrollState.canScrollRight && (
					<button
						type="button"
						onClick={() => scroll("right")}
						aria-label={m["scroll.right"]()}
						className={`absolute ${arrowTopClass} right-3 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 shadow-lg ring-1 ring-border backdrop-blur-sm transition-all hover:scale-110 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:flex md:opacity-0 md:group-hover/section:opacity-100 md:focus-visible:opacity-100`}
					>
						<CaretRight className="size-4" />
					</button>
				)}
			</div>
		</section>
	);
}
