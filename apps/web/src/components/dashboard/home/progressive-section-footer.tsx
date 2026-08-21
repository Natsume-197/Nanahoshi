import { type JSX, useRef } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { m } from "@/paraglide/messages";
import { getHomePrefetchDistance } from "./progressive-home-sections";

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
		const prefetchDistance = getHomePrefetchDistance(window.innerHeight);
		const observer = new IntersectionObserver(
			([entry]) => {
				if (!entry?.isIntersecting) return;
				onVisible();
				observer.disconnect();
			},
			{ rootMargin: `${prefetchDistance}px 0px` },
		);
		observer.observe(ref.current);
		return () => observer.disconnect();
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
