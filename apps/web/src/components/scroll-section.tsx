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
	title: string;
	showAllHref?: string;
	children: ReactNode;
}

export function ScrollSection({
	title,
	showAllHref,
	children,
}: ScrollSectionProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const updateScrollState = useCallback(() => {
		const el = scrollRef.current;
		if (!el) return;
		setCanScrollLeft(el.scrollLeft > 2);
		setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
	}, []);

	useEffect(() => {
		updateScrollState();
		const el = scrollRef.current;
		if (!el) return;
		el.addEventListener("scroll", updateScrollState, { passive: true });
		const observer = new ResizeObserver(updateScrollState);
		observer.observe(el);
		return () => {
			el.removeEventListener("scroll", updateScrollState);
			observer.disconnect();
		};
	}, [updateScrollState]);

	const scroll = (direction: "left" | "right") => {
		const el = scrollRef.current;
		if (!el) return;
		const amount = el.clientWidth * 0.75;
		el.scrollBy({
			left: direction === "left" ? -amount : amount,
			behavior: "smooth",
		});
	};

	return (
		<section className="group/section relative">
			<div className="mb-4 flex items-center justify-between">
				<h2 className="font-semibold text-xl">{title}</h2>
				{showAllHref && (
					<Link
						to={showAllHref}
						className="font-semibold text-muted-foreground text-sm transition-colors hover:text-foreground"
					>
						Show all
					</Link>
				)}
			</div>
			<div className="relative -mx-2">
				{/* Fade edges */}
				{canScrollLeft && (
					<div className="pointer-events-none absolute inset-y-0 left-0 z-[5] w-12 bg-gradient-to-r from-background to-transparent" />
				)}
				{canScrollRight && (
					<div className="pointer-events-none absolute inset-y-0 right-0 z-[5] w-12 bg-gradient-to-l from-background to-transparent" />
				)}

				{/* Arrow buttons */}
				{canScrollLeft && (
					<button
						type="button"
						onClick={() => scroll("left")}
						className="absolute top-[calc(50%-1rem)] left-1 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 opacity-0 shadow-lg ring-1 ring-border backdrop-blur-sm transition-all hover:scale-110 hover:bg-card group-hover/section:opacity-100"
					>
						<ChevronLeft className="size-4" />
					</button>
				)}
				<div
					ref={scrollRef}
					className="scrollbar-none flex gap-1 overflow-x-auto px-2"
				>
					{children}
				</div>
				{canScrollRight && (
					<button
						type="button"
						onClick={() => scroll("right")}
						className="absolute top-[calc(50%-1rem)] right-1 z-10 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-card/90 opacity-0 shadow-lg ring-1 ring-border backdrop-blur-sm transition-all hover:scale-110 hover:bg-card group-hover/section:opacity-100"
					>
						<ChevronRight className="size-4" />
					</button>
				)}
			</div>
		</section>
	);
}
