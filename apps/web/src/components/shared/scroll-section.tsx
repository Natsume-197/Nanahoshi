import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { Link, useRouter } from "@tanstack/react-router";
import {
	type KeyboardEvent,
	type ReactNode,
	useCallback,
	useId,
	useRef,
	useState,
} from "react";
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

export function getCarouselScrollBehavior(
	prefersReducedMotion: boolean,
): ScrollBehavior {
	return prefersReducedMotion ? "auto" : "smooth";
}

function getPreferredCarouselScrollBehavior(): ScrollBehavior {
	return getCarouselScrollBehavior(
		window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
	);
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
	const headingId = useId();
	const isResume = layout === "resume";
	// Nudged up toward the covers: the arrows should sit on the artwork, not on
	// the title/author block stacked beneath it. Wide cards put the text beside
	// the cover, so there the row's own centre is already the cover's centre.
	const arrowTopClass = isResume ? "top-1/2" : "top-[calc(50%-1.5rem)]";
	const scrollElRef = useRef<HTMLElement | null>(null);
	const cleanupRef = useRef<(() => void) | null>(null);
	const [scrollState, setScrollState] = useState<ScrollState>({
		canScrollLeft: false,
		canScrollRight: false,
	});
	const isScrollable = scrollState.canScrollLeft || scrollState.canScrollRight;

	const updateScrollState = useCallback((el: HTMLElement) => {
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
		(node: HTMLElement | null) => {
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
			behavior: getPreferredCarouselScrollBehavior(),
		});
	}, []);

	const handleRailKeyDown = (event: KeyboardEvent<HTMLElement>) => {
		if (event.target !== event.currentTarget) return;

		if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
			event.preventDefault();
			scroll(event.key === "ArrowLeft" ? "left" : "right");
			return;
		}

		if (event.key === "Home" || event.key === "End") {
			event.preventDefault();
			event.currentTarget.scrollTo({
				left: event.key === "Home" ? 0 : event.currentTarget.scrollWidth,
				behavior: getPreferredCarouselScrollBehavior(),
			});
		}
	};

	// The negative margin cancels the page's own inline margin so the rail bleeds
	// to the panel edge, then each row re-applies it: items and header line up
	// with the rest of the page while the overflow runs edge to edge. Both sides
	// move together — a fixed trailing pad would drift off the page margin.
	return (
		<div className="group/section relative -mx-4 md:-mx-6 lg:-mx-8">
			{title != null && (
				<div className="mb-4 flex items-start justify-between gap-3 px-4 md:px-6 lg:px-8">
					<h2
						id={headingId}
						className="min-w-0 text-balance font-semibold text-xl leading-tight"
					>
						{title}
					</h2>
					<div className="flex shrink-0 items-center gap-2">
						{headerAction}
						{showAllHref && (
							<Link
								to={showAllHref}
								state={showAllState}
								className="relative inline-flex h-7 items-center whitespace-nowrap rounded-sm font-semibold text-foreground/80 text-sm transition-colors after:absolute after:inset-x-0 after:-inset-y-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2"
							>
								{m["nav.show_all"]()}
								<span className="sr-only">: {title}</span>
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
						className={`absolute ${arrowTopClass} start-3 z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 shadow-card backdrop-blur-sm hover:bg-card hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2 motion-safe:transition-[background-color,opacity,scale,box-shadow] motion-safe:duration-150 motion-safe:active:scale-[0.96] motion-safe:hover:scale-105 md:flex md:opacity-0 md:group-hover/section:opacity-100 md:focus-visible:opacity-100`}
					>
						<CaretLeft aria-hidden className="size-4" />
					</button>
				)}
				{/* touch-action pan-x pan-y: the browser locks the gesture direction at
				    its start — a horizontal swipe pans the carousel (its only overflow
				    axis), while a vertical swipe has no vertical overflow here and so
				    bubbles up to scroll the page. `pan-x` alone would swallow vertical
				    swipes entirely, trapping page scroll on touch. */}
				<section
					ref={scrollRef}
					aria-labelledby={title != null ? headingId : undefined}
					tabIndex={isScrollable ? 0 : undefined}
					onKeyDown={handleRailKeyDown}
					className={cn(
						"scrollbar-none overflow-x-auto overscroll-x-contain px-4 py-1 [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2 md:px-6 md:py-2 lg:px-8",
						isResume
							? // The next card peeks on narrow rails; wider containers
								// add columns only when the square cover still leaves room
								// for a useful title and metadata block.
								"grid snap-x snap-proximity @[42rem]:auto-cols-[calc((100%-1rem)/2)] @[60rem]:auto-cols-[calc((100%-2rem)/3)] @[78rem]:auto-cols-[calc((100%-3rem)/4)] auto-cols-[calc(100%-1.5rem)] grid-flow-col grid-rows-1 gap-3 [scroll-padding-inline:1rem] md:gap-4 md:[scroll-padding-inline:1.5rem] lg:[scroll-padding-inline:2rem] [&>*]:snap-start"
							: "flex gap-3 md:gap-4 lg:gap-4",
					)}
				>
					{children}
				</section>
				{scrollState.canScrollRight && (
					<button
						type="button"
						onClick={() => scroll("right")}
						aria-label={m["scroll.right"]()}
						className={`absolute ${arrowTopClass} end-3 z-10 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 shadow-card backdrop-blur-sm hover:bg-card hover:shadow-card-hover focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2 motion-safe:transition-[background-color,opacity,scale,box-shadow] motion-safe:duration-150 motion-safe:active:scale-[0.96] motion-safe:hover:scale-105 md:flex md:opacity-0 md:group-hover/section:opacity-100 md:focus-visible:opacity-100`}
					>
						<CaretRight aria-hidden className="size-4" />
					</button>
				)}
			</div>
		</div>
	);
}
