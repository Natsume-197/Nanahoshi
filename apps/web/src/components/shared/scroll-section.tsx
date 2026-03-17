import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";

interface ScrollSectionProps {
	title: ReactNode;
	showAllHref?: string;
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
	headerAction,
	children,
}: ScrollSectionProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [scrollState, setScrollState] = useState<ScrollState>({
		canScrollLeft: false,
		canScrollRight: false,
	});

	const updateScrollState = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;

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

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;

		let rafId = 0;
		const onScroll = () => {
			if (rafId) return;
			rafId = requestAnimationFrame(() => {
				rafId = 0;
				updateScrollState();
			});
		};

		updateScrollState();
		el.addEventListener("scroll", onScroll, { passive: true });
		const observer = new ResizeObserver(updateScrollState);
		observer.observe(el);

		return () => {
			cancelAnimationFrame(rafId);
			el.removeEventListener("scroll", onScroll);
			observer.disconnect();
		};
	}, [updateScrollState]);

	const scroll = useCallback((direction: "left" | "right") => {
		const el = scrollRef.current;
		if (!el) return;
		const amount = el.clientWidth * 0.75;
		el.scrollBy({
			left: direction === "left" ? -amount : amount,
			behavior: "smooth",
		});
	}, []);

	return (
		<section className="group/section relative">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="font-semibold text-xl">{title}</h2>
				<div className="flex items-center gap-2">
					{headerAction}
					{showAllHref && (
						<Link
							to={showAllHref}
							className="font-semibold text-muted-foreground text-sm transition-colors hover:text-foreground"
						>
							Show all
						</Link>
					)}
				</div>
			</div>
			<div className="relative -mx-2">
				{scrollState.canScrollLeft && (
					<div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-12 bg-gradient-to-r from-background to-transparent" />
				)}
				{scrollState.canScrollRight && (
					<div className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-12 bg-gradient-to-l from-background to-transparent" />
				)}

				{scrollState.canScrollLeft && (
					<button
						type="button"
						onClick={() => scroll("left")}
						aria-label="Scroll left"
						className="absolute top-[calc(50%-1.5rem)] left-1 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 shadow-lg ring-1 ring-border backdrop-blur-sm transition-all hover:scale-110 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:flex md:opacity-0 md:group-hover/section:opacity-100 md:focus-visible:opacity-100"
					>
						<ChevronLeft className="size-4" />
					</button>
				)}
				<div
					ref={scrollRef}
					className="scrollbar-none flex gap-1 overflow-x-auto px-2 py-2"
				>
					{children}
				</div>
				{scrollState.canScrollRight && (
					<button
						type="button"
						onClick={() => scroll("right")}
						aria-label="Scroll right"
						className="absolute top-[calc(50%-1.5rem)] right-1 z-10 hidden size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 shadow-lg ring-1 ring-border backdrop-blur-sm transition-all hover:scale-110 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:flex md:opacity-0 md:group-hover/section:opacity-100 md:focus-visible:opacity-100"
					>
						<ChevronRight className="size-4" />
					</button>
				)}
			</div>
		</section>
	);
}
