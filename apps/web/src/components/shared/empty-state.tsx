import type { ReactNode } from "react";

interface EmptyStateProps {
	title?: ReactNode;
	description: ReactNode;
	children?: ReactNode;
}

export function EmptyState({ title, description, children }: EmptyStateProps) {
	return (
		<div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-md border border-border/70 border-dashed bg-card/30 px-6 text-center">
			<div className="flex flex-col gap-1">
				{title && <h3 className="font-semibold text-lg">{title}</h3>}
				<p className="max-w-sm text-muted-foreground text-sm">{description}</p>
			</div>
			{children}
		</div>
	);
}
