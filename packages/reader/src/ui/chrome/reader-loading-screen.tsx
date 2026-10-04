import { readerHost } from "../../host/reader-host";
import { m } from "../../i18n/paraglide/messages";
import type { LoadState } from "../../interaction/use-book-loader";

function phaseLabel(phase: LoadState["phase"]) {
	if (phase === "loading") return m.reader_loading_preparing();
	if (phase === "parsing") return m.reader_loading_parsing();
	if (phase !== "downloading") return "";
	// A host that keeps books on disk hands over a local file: nothing downloads.
	return readerHost().cacheBookFiles === false
		? m.reader_loading_opening()
		: m.reader_loading_downloading();
}

export function ReaderLoadingScreen({
	state,
	entering = false,
	reservePlayerSpace = false,
	backgroundColor,
	color,
}: {
	state: LoadState;
	/** The reader theme's colours, so loading and the book share one ground. */
	backgroundColor?: string;
	color?: string;
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
			style={{ backgroundColor, color }}
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
				<p role="status" aria-live="polite" className="text-sm opacity-60">
					{phaseLabel(state.phase)}
				</p>
				{showBar && (
					<div className="flex w-56 flex-col items-center gap-1.5">
						<div className="h-1.5 w-full overflow-hidden rounded-full bg-current/15">
							<div
								className="h-full rounded-full bg-current transition-[width] duration-300 ease-out motion-reduce:transition-none"
								style={{ width: `${pct}%` }}
							/>
						</div>
						<p className="text-xs tabular-nums opacity-60">{pct}%</p>
					</div>
				)}
			</div>
		</main>
	);
}
