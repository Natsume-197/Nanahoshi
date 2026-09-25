import { type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";

// One label open page-wide: showing a chart's closes whichever another chart left behind.
let closeOpen: (() => void) | null = null;

/**
 * One floating label for a whole chart. Marks opt in with `data-tip` (and an
 * optional `data-tip-detail`); the label follows pointer and keyboard focus by
 * writing to the DOM directly, so hovering hundreds of heatmap cells never
 * re-renders the chart.
 */
export function HoverTip({
	children,
	className,
}: {
	children: ReactNode;
	className?: string;
}) {
	const root = useRef<HTMLDivElement>(null);
	const tip = useRef<HTMLDivElement>(null);
	const title = useRef<HTMLSpanElement>(null);
	const detail = useRef<HTMLSpanElement>(null);
	const hide = () => {
		if (tip.current) tip.current.dataset.open = "false";
	};
	const show = (target: EventTarget | null) => {
		const container = root.current;
		const mark =
			target instanceof Element
				? target.closest<HTMLElement>("[data-tip]")
				: null;
		if (!container || !mark || !container.contains(mark) || !tip.current)
			return hide();
		if (title.current) title.current.textContent = mark.dataset.tip ?? "";
		if (detail.current) {
			detail.current.textContent = mark.dataset.tipDetail ?? "";
			detail.current.hidden = !mark.dataset.tipDetail;
		}
		const box = container.getBoundingClientRect();
		const rect = mark.getBoundingClientRect();
		const width = tip.current.offsetWidth;
		const center = rect.left - box.left + rect.width / 2;
		// Keep the label inside the chart's own box near its edges.
		const left = Math.max(width / 2, Math.min(box.width - width / 2, center));
		tip.current.style.left = `${left}px`;
		tip.current.style.top = `${rect.top - box.top - 6}px`;
		if (closeOpen !== hide) closeOpen?.();
		closeOpen = hide;
		tip.current.dataset.open = "true";
	};
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: listeners only move a decorative label; the marks inside stay the controls.
		<div
			ref={root}
			className={cn("relative", className)}
			onPointerOver={(event) =>
				event.pointerType === "touch" ? undefined : show(event.target)
			}
			onPointerLeave={hide}
			onFocus={(event) => show(event.target)}
			onBlur={hide}
		>
			{children}
			<div
				ref={tip}
				aria-hidden="true"
				data-open="false"
				className="pointer-events-none absolute z-30 flex -translate-x-1/2 -translate-y-full flex-col whitespace-nowrap rounded-lg bg-popover px-2.5 py-1.5 text-popover-foreground text-xs shadow-md ring-1 ring-border/60 transition-opacity duration-100 data-[open=false]:opacity-0 motion-reduce:transition-none"
			>
				<span
					ref={title}
					className="font-medium tabular-nums first-letter:uppercase"
				/>
				<span ref={detail} className="text-muted-foreground tabular-nums" />
			</div>
		</div>
	);
}
