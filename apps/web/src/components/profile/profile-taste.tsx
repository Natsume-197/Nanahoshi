import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";

export type TasteAuthor = { id: number | null; name: string; count: number };

interface ProfileTasteProps {
	authors: TasteAuthor[];
}

const CHIP_CLASS =
	"inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 font-medium text-foreground/90 text-xs ring-1 ring-border/50 transition-colors hover:bg-muted";

export function ProfileTaste({ authors }: ProfileTasteProps) {
	if (authors.length < 2) return null;

	return (
		<div className="rounded-xl border border-border/70 bg-card/40 p-4">
			<span className="flex items-center gap-1.5 font-semibold text-muted-foreground text-xs uppercase tracking-wide">
				<Sparkles className="size-3.5 text-chart-3" />
				Reads a lot of
			</span>
			<div className="mt-2.5 flex flex-wrap gap-1.5">
				{authors.map((author) => {
					const inner = (
						<>
							<span className="truncate">{author.name}</span>
							<span className="text-[10px] text-muted-foreground tabular-nums">
								{author.count}
							</span>
						</>
					);
					return author.id != null ? (
						<Link
							key={author.name}
							to="/dashboard/authors/$authorId"
							params={{ authorId: String(author.id) }}
							className={CHIP_CLASS}
						>
							{inner}
						</Link>
					) : (
						<span key={author.name} className={className}>
							{inner}
						</span>
					);
				})}
			</div>
		</div>
	);
}
