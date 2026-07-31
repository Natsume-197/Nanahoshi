import { useRef, useState } from "react";
import { marqueeVars, shouldSweep } from "@/components/audio-player/marquee";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { cn } from "@/lib/utils";

/**
 * A line of text that slides to its end and back when it doesn't fit, edges
 * faded. Renders spans only, so it can sit inside a heading or a paragraph.
 */
export function MarqueeText({
	text,
	className,
}: {
	text: string;
	className?: string;
}) {
	const containerRef = useRef<HTMLSpanElement>(null);
	const [overflow, setOverflow] = useState(0);

	// Both boxes: the container catches a resize, the content a new title.
	useMountEffect(() => {
		const container = containerRef.current;
		const content = container?.firstElementChild;
		if (!container || !content) return;

		const measure = () =>
			setOverflow(Math.max(0, content.scrollWidth - container.clientWidth));
		const observer = new ResizeObserver(measure);
		observer.observe(container);
		observer.observe(content);
		return () => observer.disconnect();
	});

	const isSweeping = shouldSweep(overflow);

	return (
		<span
			ref={containerRef}
			title={text}
			className={cn(
				"relative block overflow-hidden",
				overflow > 0 &&
					"[mask-image:linear-gradient(to_right,transparent,black_1rem,black_calc(100%-1rem),transparent)]",
				className,
			)}
			style={
				isSweeping ? (marqueeVars(overflow) as React.CSSProperties) : undefined
			}
		>
			{/* w-max, or the box never changes and the observer never fires. */}
			<span className={cn("block w-max", isSweeping && "marquee-sweep")}>
				{text}
			</span>
		</span>
	);
}
