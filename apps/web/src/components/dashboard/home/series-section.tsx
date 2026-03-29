import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { type JSX, memo } from "react";
import { ScrollSection } from "@/components/shared/scroll-section";
import { coverPresets, getCoverPresetUrl } from "@/utils/covers";

export type SeriesEntry = {
	id: number;
	name: string;
	count: number;
	cover: string | null;
};

type SeriesSectionProps = {
	title: string;
	showAllHref: string;
	seriesDetailPath: string;
	series: SeriesEntry[];
	icon: LucideIcon;
	aspectRatio?: "square" | "book";
	countLabel: [string, string];
};

export const SeriesSection = memo(function SeriesSection({
	title,
	showAllHref,
	seriesDetailPath,
	series,
	icon: Icon,
	aspectRatio = "book",
	countLabel,
}: SeriesSectionProps): JSX.Element | null {
	if (series.length === 0) {
		return null;
	}

	return (
		<ScrollSection title={title} showAllHref={showAllHref}>
			{series.map((s) => (
				<Link
					key={s.id}
					to={seriesDetailPath}
					params={{ seriesName: s.name }}
					className="group w-[160px] shrink-0"
				>
					<div
						className={`relative w-full overflow-hidden rounded-md bg-muted ${aspectRatio === "square" ? "aspect-square" : "aspect-[2/3]"}`}
					>
						{s.cover ? (
							<img
								src={getCoverPresetUrl(
									s.cover.split("/").pop() ?? "",
									coverPresets.small,
								)}
								alt={s.name}
								className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
								loading="lazy"
							/>
						) : (
							<div className="flex h-full w-full items-center justify-center">
								<Icon className="size-8 text-muted-foreground/40" />
							</div>
						)}
					</div>
					<div className="px-0.5 pt-2">
						<p className="line-clamp-2 font-medium text-sm leading-tight">
							{s.name}
						</p>
						<p className="text-muted-foreground text-xs">
							{s.count} {s.count === 1 ? countLabel[0] : countLabel[1]}
						</p>
					</div>
				</Link>
			))}
		</ScrollSection>
	);
});
