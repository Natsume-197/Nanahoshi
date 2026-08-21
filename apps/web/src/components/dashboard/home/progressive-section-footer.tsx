import { type JSX, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { m } from "@/paraglide/messages";
import { getHomePrefetchDistance } from "./progressive-home-sections";

type NavigatorWithConnection = Navigator & {
	connection?: {
		effectiveType?: string;
		saveData?: boolean;
	};
};

// Mounted only while `observe` is true, so the observer setup/teardown can be
// a plain mount effect instead of a guarded, dependency-driven one.
function FooterViewportObserver({
	onVisible,
}: {
	onVisible: () => void;
}): JSX.Element {
	const ref = useRef<HTMLDivElement>(null);
	useMountEffect(() => {
		if (!ref.current) return;
		const { connection } = navigator as NavigatorWithConnection;
		let observer: IntersectionObserver | undefined;
		let observedDistance = 0;
		let lastPosition: number | undefined;
		let lastTimestamp: number | undefined;
		let smoothedVelocity = 0;
		let animationFrame: number | undefined;
		let triggered = false;

		const observeAtDistance = (distance: number) => {
			if (triggered) return;
			if (observer && Math.abs(distance - observedDistance) < 400) return;
			observer?.disconnect();
			observedDistance = distance;
			observer = new IntersectionObserver(
				([entry]) => {
					if (!entry?.isIntersecting || triggered) return;
					triggered = true;
					onVisible();
					observer?.disconnect();
				},
				{ rootMargin: `${distance}px 0px` },
			);
			if (ref.current) observer.observe(ref.current);
		};

		const updateDistance = () => {
			animationFrame = undefined;
			observeAtDistance(
				getHomePrefetchDistance(window.innerHeight, {
					effectiveType: connection?.effectiveType,
					saveData: connection?.saveData,
					scrollVelocity: smoothedVelocity,
				}),
			);
		};

		const handleScroll = (event: Event) => {
			if (triggered) return;
			const now = performance.now();
			const position =
				event.target instanceof Element
					? event.target.scrollTop
					: window.scrollY;
			if (lastPosition !== undefined && lastTimestamp !== undefined) {
				const elapsed = now - lastTimestamp;
				if (elapsed > 0) {
					const velocity = Math.abs(position - lastPosition) / elapsed;
					smoothedVelocity = smoothedVelocity * 0.7 + velocity * 0.3;
				}
			}
			lastPosition = position;
			lastTimestamp = now;
			if (animationFrame === undefined) {
				animationFrame = requestAnimationFrame(updateDistance);
			}
		};

		updateDistance();
		window.addEventListener("scroll", handleScroll, {
			capture: true,
			passive: true,
		});
		return () => {
			observer?.disconnect();
			window.removeEventListener("scroll", handleScroll, { capture: true });
			if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
		};
	});
	return <div ref={ref} className="absolute inset-0" />;
}

export function ProgressiveSectionFooter({
	loading,
	observe,
	onVisible,
}: {
	loading: boolean;
	observe: boolean;
	onVisible: () => void;
}): JSX.Element {
	return (
		<div
			data-testid="progressive-section-footer"
			className="relative h-px"
			aria-hidden={!loading}
		>
			{observe ? <FooterViewportObserver onVisible={onVisible} /> : null}
			{loading ? (
				<div
					className="absolute inset-x-0 top-0 flex h-12 items-center"
					aria-busy
				>
					<Skeleton className="h-5 w-36 rounded" />
					<span className="sr-only">{m["common.loading"]()}</span>
				</div>
			) : null}
		</div>
	);
}
