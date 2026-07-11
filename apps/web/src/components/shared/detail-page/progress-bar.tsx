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
				className="h-full w-full origin-left transition-transform duration-300 ease-out-quint motion-reduce:transition-none"
				style={{
					transform: `scaleX(${Math.min(100, percentage) / 100})`,
					backgroundColor: accentColor ?? "var(--primary)",
				}}
			/>
		</div>
	);
}
