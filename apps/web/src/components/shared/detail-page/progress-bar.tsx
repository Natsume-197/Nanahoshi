export function CoverProgressBar({
	percentage,
	accentColor,
}: {
	percentage: number;
	accentColor: string | null;
}) {
	if (percentage <= 0) return null;

	return (
		<div
			aria-hidden="true"
			className="absolute inset-x-0 bottom-0 h-1 bg-black/30"
		>
			<div
				className="h-full transition-[width] motion-reduce:transition-none"
				style={{
					width: `${Math.min(100, percentage)}%`,
					backgroundColor: accentColor ?? "var(--primary)",
				}}
			/>
		</div>
	);
}
