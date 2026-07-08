import { Link } from "@tanstack/react-router";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { m } from "@/paraglide/messages";

interface ScrollSectionProps {
	title: ReactNode;
	showAllHref?: string;
	/** History state for the "Show all" link (e.g. { format: "audiobooks" }). */
	showAllState?: Record<string, unknown>;
	headerAction?: ReactNode;
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
	children,
}: ScrollSectionProps) {
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

			let rafId = 0;
			const onScroll = () => {
				if (rafId) return;
				rafId = requestAnimationFrame(() => {
					rafId = 0;
					updateScrollState(node);
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
			};
		},
		[updateScrollState],
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

	return (
		<section className="group/section relative -mx-3 md:-mx-6 lg:-mx-8">
			<div className="mb-2 flex items-center justify-between gap-3 pr-5 pl-3 md:pl-6 lg:pl-8">
				<h2 className="min-w-0 truncate font-semibold text-xl">{title}</h2>
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
			<div className="relative">
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
						className="absolute top-[calc(50%-1.5rem)] left-3 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 shadow-lg ring-1 ring-border backdrop-blur-sm transition-all hover:scale-110 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:flex md:opacity-0 md:group-hover/section:opacity-100 md:focus-visible:opacity-100"
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
					className="scrollbar-none flex gap-1 overflow-x-auto overscroll-x-contain px-3 py-1 [-webkit-overflow-scrolling:touch] [touch-action:pan-x_pan-y] md:gap-2 md:px-6 md:py-2 lg:px-8"
				>
					{children}
				</div>
				{scrollState.canScrollRight && (
					<button
						type="button"
						onClick={() => scroll("right")}
						aria-label={m["scroll.right"]()}
						className="absolute top-[calc(50%-1.5rem)] right-3 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 shadow-lg ring-1 ring-border backdrop-blur-sm transition-all hover:scale-110 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:flex md:opacity-0 md:group-hover/section:opacity-100 md:focus-visible:opacity-100"
					>
						<CaretRight className="size-4" />
					</button>
				)}
			</div>
		</section>
	);
}
