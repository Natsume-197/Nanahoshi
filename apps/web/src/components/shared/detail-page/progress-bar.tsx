export function CoverProgressBar({
	percentage,
	accentColor,
}: {
	percentage: number;
	accentColor: string | null;
}) {
	if (percentage <= 0) return null;

	return (
		<div className="absolute inset-x-0 bottom-0 h-1 bg-black/30">
			<div
				className="h-full transition-all"
				style={{
					width: `${Math.min(100, percentage)}%`,
					backgroundColor: accentColor ?? "var(--primary)",
				}}
			/>
		</div>
	);
}
