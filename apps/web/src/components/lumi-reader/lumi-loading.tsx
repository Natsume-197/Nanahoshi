import type { ReaderTheme } from "@/lib/lumi/settings";

interface LumiLoadingProps {
	theme: ReaderTheme;
	/** Download fraction [0,1] while fetching; undefined once parsing (spinner only). */
	progress: number | undefined;
}

/** Loading screen: spinner, label, and a determinate download bar. */
export function LumiLoading(props: LumiLoadingProps) {
	const { theme, progress } = props;
	const downloading = progress !== undefined && progress > 0 && progress < 1;
	const pct = Math.round((progress ?? 0) * 100);

	return (
		<div
			className="writing-horizontal-tb fixed inset-0 z-20 flex h-full w-full flex-col items-center justify-center gap-4"
			style={{ color: theme.fontColor, backgroundColor: theme.backgroundColor }}
		>
			<div className="size-12 animate-spin rounded-full border-2 border-current border-t-transparent" />
			<p className="text-sm opacity-60">
				{downloading ? "Downloading…" : "Loading…"}
			</p>
			{downloading && (
				<div className="flex w-56 flex-col items-center gap-1.5">
					<div
						className="h-1.5 w-full overflow-hidden rounded-full"
						style={{
							backgroundColor: `color-mix(in oklab, ${theme.fontColor} 15%, transparent)`,
						}}
					>
						<div
							className="h-full rounded-full transition-[width] duration-300 ease-out"
							style={{ width: `${pct}%`, backgroundColor: theme.fontColor }}
						/>
					</div>
					<p className="text-xs tabular-nums opacity-60">{pct}%</p>
				</div>
			)}
		</div>
	);
}
