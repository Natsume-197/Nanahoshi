import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const CHIP_CLASS =
	"inline-flex min-h-7 items-center rounded-full border border-border/70 bg-muted/50 px-2.5 py-1 font-medium text-muted-foreground text-xs transition-colors";
const CHIP_LINK_CLASS =
	"hover:border-[color-mix(in_oklab,var(--book-accent)_45%,var(--border))] hover:bg-[color-mix(in_oklab,var(--book-accent)_14%,transparent)] hover:text-foreground";

export interface GenreChipItem {
	/** Present when the entry links to its catalog page; absent for bare
	 *  string genres from unenriched metadata, which render as plain text. */
	uuid?: string;
	name: string;
}

/** Genre/tag chips, shared by the detail-page hero and its Details rows. */
export function GenreChips({
	items,
	linkTo,
}: {
	items: GenreChipItem[];
	linkTo: "genres" | "tags";
}) {
	if (items.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-1.5">
			{items.map((item) =>
				item.uuid ? (
					<Link
						key={item.uuid}
						to={
							linkTo === "genres"
								? "/dashboard/genres/$uuid"
								: "/dashboard/tags/$uuid"
						}
						params={{ uuid: item.uuid }}
						className={cn(CHIP_CLASS, CHIP_LINK_CLASS)}
					>
						{item.name}
					</Link>
				) : (
					<span key={item.name} className={CHIP_CLASS}>
						{item.name}
					</span>
				),
			)}
		</div>
	);
}
