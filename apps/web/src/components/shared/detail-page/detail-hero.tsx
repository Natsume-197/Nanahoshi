import { type CSSProperties, Fragment, type ReactNode } from "react";
import { PAGE_GUTTER } from "@/lib/page-layout";
import { typesetProps } from "@/lib/text-lang";
import { cn } from "@/lib/utils";
import { getHeroSurfaceColors } from "@/utils/color";

const FALLBACK_SURFACE = { base: "rgb(58 56 64)", deep: "rgb(44 42 49)" };

// Plain app buttons: the hero no longer sits on its own coloured slab, so its
// actions use the same variants and sizes as every other page. Spread onto
// <Button>; one step above lg, as the page's main actions. min-w-0 lets a long
// label shrink inside the phone's split row.
const HERO_BUTTON_SIZE = "h-10 min-w-0 gap-2 px-5 text-[0.9375rem]";
export const HERO_PRIMARY_BUTTON = {
	size: "lg",
	className: HERO_BUTTON_SIZE,
} as const;
export const HERO_SECONDARY_BUTTON = {
	size: "lg",
	variant: "secondary",
	className: HERO_BUTTON_SIZE,
} as const;
export const HERO_ICON_BUTTON = {
	size: "icon-lg",
	variant: "secondary",
	className: "size-10",
} as const;

export const HERO_LINK_CLASSNAME =
	"underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground";

/**
 * The top of a book or audiobook page: the cover, blurred and dimmed, washes
 * the area behind the artwork, title and actions, then dissolves into the
 * page's own surface.
 */
export function DetailHero({
	tint,
	backdropUrl,
	labelledBy,
	cover,
	coverShape,
	header,
	actions,
}: {
	tint: string | null | undefined;
	backdropUrl?: string | null;
	labelledBy: string;
	cover: ReactNode;
	coverShape: "book" | "square";
	header: ReactNode;
	actions: ReactNode;
}) {
	const surface = getHeroSurfaceColors(tint) ?? FALLBACK_SURFACE;
	const style = {
		"--hero-surface": surface.base,
		"--hero-surface-deep": surface.deep,
		// Read by CoverImage: the cover casts a shadow in its own, deeper hue.
		"--cover-shadow": `color-mix(in oklab, ${surface.deep} 45%, black)`,
	} as CSSProperties;

	return (
		<section
			aria-labelledby={labelledBy}
			className="relative isolate overflow-hidden"
			style={style}
		>
			{/* Masked rather than overlaid: a separate fade layer drifts from the
			    blurred image while mobile scrolls and leaves a raw band. */}
			<div
				aria-hidden="true"
				className="absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,black,rgb(0_0_0/0.7)_45%,rgb(0_0_0/0.3)_75%,transparent)]"
			>
				{backdropUrl ? (
					<img
						src={backdropUrl}
						alt=""
						decoding="async"
						className="size-full scale-110 object-cover opacity-60 blur-3xl brightness-[0.50] saturate-125 dark:opacity-70"
					/>
				) : (
					<div className="size-full bg-[var(--hero-surface)] opacity-30" />
				)}
			</div>
			{/* Below md the back button floats where the top bar used to be. */}
			<div className={cn(PAGE_GUTTER, "pt-16 pb-8 md:pt-8")}>
				<div className="mx-auto grid max-w-[1400px] gap-x-12 gap-y-6 lg:grid-cols-[auto_minmax(0,1fr)] xl:gap-x-14">
					<div
						className={cn(
							"mx-auto w-full lg:mx-0 lg:max-w-none",
							coverShape === "square"
								? "max-w-[15rem] sm:max-w-[17rem] lg:w-60 xl:w-64"
								: "max-w-[14rem] sm:max-w-[16rem] lg:w-52 xl:w-56",
						)}
					>
						{cover}
					</div>
					<div className="flex min-w-0 flex-col items-center gap-6 text-center lg:items-start lg:justify-end lg:py-2 lg:text-start">
						<header className="flex min-w-0 flex-col items-center gap-3 lg:items-start">
							{header}
						</header>
						<div className="w-full">{actions}</div>
					</div>
				</div>
			</div>
		</section>
	);
}

export function HeroTitle({
	id,
	children,
}: {
	id: string;
	children: ReactNode;
}) {
	return (
		<h1
			id={id}
			{...typesetProps(children, "display")}
			className="text-balance break-words font-bold text-2xl text-foreground leading-tight tracking-tight sm:text-3xl sm:leading-[1.1] lg:text-4xl dark:text-white dark:[text-shadow:0_1px_16px_rgb(0_0_0/0.35)]"
		>
			{children}
		</h1>
	);
}

/** "★ 4.3 (1.2k) · Novela · 2021 · EPUB": the small facts, one line, middots. */
export function HeroMeta({ items }: { items: ReactNode[] }) {
	const present = items.filter(
		(item) => item !== null && item !== undefined && item !== false,
	);
	if (present.length === 0) return null;
	return (
		<p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-foreground/75 text-sm tabular-nums lg:justify-start">
			{present.map((item, index) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: static, order-stable list
				<Fragment key={index}>
					{index > 0 && (
						<span aria-hidden="true" className="text-foreground/40">
							·
						</span>
					)}
					<span>{item}</span>
				</Fragment>
			))}
		</p>
	);
}

/** Primary on its own row on phones; everything sits on one row from sm. */
export function HeroActionRow({
	primary,
	secondary,
	icons,
}: {
	primary: ReactNode;
	secondary?: ReactNode;
	icons?: ReactNode;
}) {
	return (
		<div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center lg:justify-start">
			<div className="flex gap-2 *:flex-1 sm:*:flex-none">{primary}</div>
			{(secondary || icons) && (
				<div className="flex items-center gap-2 *:first:flex-1 sm:*:first:flex-none">
					{secondary}
					{icons}
				</div>
			)}
		</div>
	);
}
