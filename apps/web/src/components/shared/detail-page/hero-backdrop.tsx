import type { CSSProperties } from "react";

/**
 * Ambient wash behind a detail-page hero, built from the artwork's dominant
 * color and a blurred cover. The scrim mixes toward `--background` so text stays
 * readable in both themes while the wash remains visible across the page.
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
			className="motion-safe:fade-in pointer-events-none absolute inset-0 overflow-hidden motion-safe:animate-in motion-safe:duration-400"
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
					className="absolute inset-0 h-full w-full scale-150 object-cover opacity-45 blur-[80px] saturate-110"
					loading="eager"
					decoding="async"
					aria-hidden="true"
				/>
			) : (
				<div
					className="absolute inset-0"
					style={{
						background:
							"radial-gradient(100% 85% at 18% 8%, color-mix(in oklab, var(--book-accent) 52%, var(--background)), var(--background) 72%)",
					}}
				/>
			)}

			{/* Localized color bloom: strongest near the artwork, quieter behind copy. */}
			<div
				className="absolute inset-0"
				style={{
					background:
						"radial-gradient(85% 72% at 12% 6%, color-mix(in oklab, var(--book-accent) 48%, transparent), transparent 68%)",
				}}
			/>

			{/* Directional scrim protects the text column without flattening the artwork. */}
			<div
				className="absolute inset-0"
				style={{
					background:
						"linear-gradient(to right, color-mix(in oklab, var(--background) 42%, transparent) 0%, color-mix(in oklab, var(--background) 66%, transparent) 48%, color-mix(in oklab, var(--background) 82%, transparent) 100%)",
				}}
			/>

			{/* A translucent vertical veil keeps lower-page content calm while retaining tint. */}
			<div
				className="absolute inset-0"
				style={{
					background:
						"linear-gradient(to bottom, color-mix(in oklab, var(--background) 52%, transparent) 0%, color-mix(in oklab, var(--background) 68%, transparent) 52%, color-mix(in oklab, var(--background) 82%, transparent) 100%)",
				}}
			/>
		</div>
	);
}
