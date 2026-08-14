import type { LoadState } from "./use-book-loader";

const PHASE_LABEL: Record<LoadState["phase"], string> = {
	loading: "Loading…",
	downloading: "Downloading…",
	parsing: "Parsing…",
	error: "",
	ready: "",
};

export function ReaderLoadingScreen({
	state,
	entering = false,
	reservePlayerSpace = false,
}: {
	state: LoadState;
	/** Marks only the route-level shell, so internal loading updates stay still. */
	entering?: boolean;
	reservePlayerSpace?: boolean;
}) {
	const progress = state.phase === "downloading" ? state.progress : undefined;
	const showBar = progress !== undefined;
	const pct = Math.round((progress ?? 0) * 100);

	return (
		<main
			aria-busy="true"
			className={`fixed inset-0 h-dvh w-full overflow-hidden bg-background font-reader-sans text-foreground ${
				entering ? "reader-route-content" : ""
			}`}
		>
			<div
				className={`flex h-full w-full flex-col items-center justify-center gap-4 px-6 pt-[var(--safe-area-top)] ${
					reservePlayerSpace
						? "pb-[calc(var(--mobile-player-height)+var(--safe-area-bottom))] md:pb-[calc(88px+var(--safe-area-bottom))]"
						: "pb-[var(--safe-area-bottom)]"
				}`}
			>
				<div
					aria-hidden="true"
					className="size-12 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
				/>
				<p
					role="status"
					aria-live="polite"
					className="text-muted-foreground text-sm"
				>
					{PHASE_LABEL[state.phase]}
				</p>
				{showBar && (
					<div className="flex w-56 flex-col items-center gap-1.5">
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/15">
							<div
								className="h-full rounded-full bg-foreground transition-[width] duration-300 ease-out motion-reduce:transition-none"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<p className="text-muted-foreground text-xs tabular-nums">{pct}%</p>
					</div>
				)}
			</div>
		</main>
	);
}
