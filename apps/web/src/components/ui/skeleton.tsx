import { cn } from "@/lib/utils";

type SkeletonOwnProps = {
	variant?: "default" | "surface";
};

type DivSkeletonProps = SkeletonOwnProps &
	React.ComponentPropsWithRef<"div"> & {
		as?: "div";
	};

type SpanSkeletonProps = SkeletonOwnProps &
	React.ComponentPropsWithRef<"span"> & {
		as: "span";
	};

type SkeletonProps = DivSkeletonProps | SpanSkeletonProps;

function skeletonClassName(
	variant: NonNullable<SkeletonOwnProps["variant"]>,
	className?: string,
) {
	return cn(
		"skeleton-pulse rounded-2xl",
		variant === "surface" ? "bg-surface-card" : "bg-foreground/10",
		className,
	);
}

function renderDivSkeleton({
	as: _as,
	className,
	variant = "default",
	...props
}: DivSkeletonProps) {
	return (
		<div
			data-slot="skeleton"
			className={skeletonClassName(variant, className)}
			{...props}
		/>
	);
}

function renderSpanSkeleton({
	as: _as,
	className,
	variant = "default",
	...props
}: SpanSkeletonProps) {
	return (
		<span
			data-slot="skeleton"
			className={skeletonClassName(variant, className)}
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
