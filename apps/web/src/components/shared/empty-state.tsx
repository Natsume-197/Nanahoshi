import type { ReactNode } from "react";

interface EmptyStateProps {
	icon?: ReactNode;
	title?: ReactNode;
	description: ReactNode;
	variant?: "muted" | "primary";
	children?: ReactNode;
}

export function EmptyState({
	icon,
	title,
	description,
	variant = "muted",
	children,
}: EmptyStateProps) {
	const iconClass =
		variant === "primary"
			? "bg-primary/10 text-primary"
			: "bg-muted/50 text-muted-foreground";

	return (
		<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-md border border-border/70 border-dashed bg-card/30 px-6 text-center">
			{icon && (
				<div
					className={`flex size-12 items-center justify-center rounded-full ${iconClass}`}
				>
					{icon}
				</div>
			)}
			<div className="flex flex-col gap-1">
				{title && <h3 className="font-semibold text-lg">{title}</h3>}
				<p className="max-w-sm text-muted-foreground text-sm">{description}</p>
			</div>
			{children}
		</div>
	);
}
