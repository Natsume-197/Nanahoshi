import type { LoadState } from "./use-book-loader";

const PHASE_LABEL: Record<LoadState["phase"], string> = {
	loading: "Loading…",
	downloading: "Downloading…",
	parsing: "Parsing…",
	error: "",
	ready: "",
};

/**
 * Pre-render loading screen shown before the book is ready: a spinner plus a
 * phase label, and a determinate progress bar while the book file downloads
 * (indeterminate downloads and the parse phase show the spinner alone).
 */
export function ReaderLoadingScreen({ state }: { state: LoadState }) {
	const progress = state.phase === "downloading" ? state.progress : undefined;
	const showBar = progress !== undefined;
	const pct = Math.round((progress ?? 0) * 100);

	return (
		<div className="fixed inset-0 flex h-full w-full flex-col items-center justify-center gap-4">
			<div className="size-12 animate-spin rounded-full border-2 border-current border-t-transparent" />
			<p className="text-muted-foreground text-sm">
				{PHASE_LABEL[state.phase]}
			</p>
			{showBar && (
				<div className="flex w-56 flex-col items-center gap-1.5">
					<div className="h-1.5 w-full overflow-hidden rounded-full bg-white/15">
						<div
							className="h-full rounded-full bg-white transition-[width] duration-300 ease-out"
							style={{ width: `${pct}%` }}
						/>
					</div>
					<p className="text-muted-foreground text-xs tabular-nums">{pct}%</p>
				</div>
			)}
		</div>
	);
}
