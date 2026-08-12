import { cn } from "@/lib/utils";

type DivSkeletonProps = React.ComponentPropsWithRef<"div"> & {
	as?: "div";
};

type SpanSkeletonProps = React.ComponentPropsWithRef<"span"> & {
	as: "span";
};

type SkeletonProps = DivSkeletonProps | SpanSkeletonProps;

function skeletonClassName(className?: string) {
	return cn("skeleton-pulse rounded-2xl bg-foreground/10", className);
}

function renderDivSkeleton({ as: _as, className, ...props }: DivSkeletonProps) {
	return (
		<div
			data-slot="skeleton"
			className={skeletonClassName(className)}
			{...props}
		/>
	);
}

function renderSpanSkeleton({
	as: _as,
	className,
	...props
}: SpanSkeletonProps) {
	return (
		<span
			data-slot="skeleton"
			className={skeletonClassName(className)}
			{...props}
		/>
	);
}

function Skeleton(props: SkeletonProps) {
	return props.as === "span"
		? renderSpanSkeleton(props)
		: renderDivSkeleton(props);
}

export { Skeleton };
