import type { CSSProperties } from "react";

/**
 * Ambient wash behind a detail-page hero, built from the artwork's dominant
 * color and a blurred cover. The scrim mixes toward `--background` so text stays
 * readable in both themes and the wash dissolves into the page below the hero.
 *
 * Reads `--book-accent`; pass `accent` when rendered outside the page tree (e.g.
 * from the layout, behind the header) where getHeroStyle isn't in scope.
 */
export function HeroBackdrop({
	coverUrl,
	coverSrcSet,
	accent,
}: {
	coverUrl: string | null;
	coverSrcSet?: string;
	accent?: string | null;
}) {
	return (
		<div
			className="motion-safe:fade-in pointer-events-none absolute inset-0 overflow-hidden motion-safe:animate-in motion-safe:duration-700"
			aria-hidden="true"
			style={
				accent ? ({ "--book-accent": accent } as CSSProperties) : undefined
			}
		>
			{coverUrl ? (
				<img
					src={coverUrl}
					srcSet={coverSrcSet}
					alt=""
					className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-[64px] saturate-125 dark:opacity-40"
					loading="eager"
					decoding="async"
					aria-hidden="true"
				/>
			) : (
				<div
					className="absolute inset-0"
					style={{
						background:
							"radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--book-accent) 46%, var(--background)), var(--background) 70%)",
					}}
				/>
			)}

			{/* Accent tint — pulls the wash toward the book color even when the cover blur is desaturated. */}
			<div
				className="absolute inset-0"
				style={{
					background:
						"radial-gradient(115% 80% at 50% -10%, color-mix(in oklab, var(--book-accent) 40%, transparent), transparent 60%)",
				}}
			/>

			{/* Readability scrim + bottom fade into the page. Mixes toward --background so
			    light themes stay light (dark text) and dark themes stay dark (light text). */}
			<div
				className="absolute inset-0"
				style={{
					background:
						"linear-gradient(to bottom, color-mix(in oklab, var(--background) 70%, transparent) 0%, color-mix(in oklab, var(--background) 60%, transparent) 50%, var(--background) 100%)",
				}}
			/>
		</div>
	);
}
