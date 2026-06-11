import type { ReaderTheme } from "@/lib/reader/settings";

/**
 * Full-screen spinner shown while a reader mode measures the initial layout
 * (until `allowDisplay`). Forced to horizontal writing mode so the spinner is
 * upright even when the book itself renders vertical-rl.
 */
export function ReaderLoadingOverlay({ theme }: { theme: ReaderTheme }) {
	return (
		<div
			className="writing-horizontal-tb fixed inset-0 z-20 flex items-center justify-center"
			style={{
				color: theme.fontColor,
				backgroundColor: theme.backgroundColor,
			}}
		>
			<div className="size-12 animate-spin rounded-full border-2 border-current border-t-transparent" />
		</div>
	);
}
