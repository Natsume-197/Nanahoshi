import { useRef, useState } from "react";
import { marqueeVars, shouldLoop } from "@/components/audio-player/marquee";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { cn } from "@/lib/utils";

/**
 * A line of text that scrolls end to end in one direction when it doesn't fit,
 * edges faded. Renders spans only, so it can sit inside a heading or a
 * paragraph.
 */
export function MarqueeText({
	text,
	className,
}: {
	text: string;
	className?: string;
}) {
	const containerRef = useRef<HTMLSpanElement>(null);
	const contentRef = useRef<HTMLSpanElement>(null);
	const [metrics, setMetrics] = useState({ content: 0, container: 0 });

	// Both boxes: the container catches a resize, the content a new title.
	useMountEffect(() => {
		const container = containerRef.current;
		const content = contentRef.current;
		if (!container || !content) return;

		const measure = () =>
			setMetrics((previous) => {
				const next = {
					content: content.scrollWidth,
					container: container.clientWidth,
				};
				return previous.content === next.content &&
					previous.container === next.container
					? previous
					: next;
			});
		const observer = new ResizeObserver(measure);
		observer.observe(container);
		observer.observe(content);
		return () => observer.disconnect();
	});

	const overflow = Math.max(0, metrics.content - metrics.container);
	const isLooping = shouldLoop(overflow);

	return (
		<span
			ref={containerRef}
			title={text}
			className={cn(
				"relative block overflow-hidden",
				overflow > 0 &&
					(isLooping
						? "[mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1.5rem),transparent)]"
						: "[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)]"),
				className,
			)}
			style={
				isLooping
					? (marqueeVars(metrics.content) as React.CSSProperties)
					: undefined
			}
		>
			{/* w-max, or the box never changes and the observer never fires. */}
			<span
				className={cn(
					"flex w-max gap-[var(--marquee-gap)]",
					isLooping && "marquee-loop",
				)}
			>
				<span ref={contentRef} className="block w-max shrink-0">
					{text}
				</span>
				{isLooping && (
					<span aria-hidden className="block w-max shrink-0">
						{text}
					</span>
				)}
			</span>
		</span>
	);
}
