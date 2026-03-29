import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SynopsisSection({
	description,
}: {
	description?: string | null;
}) {
	const [expanded, setExpanded] = useState(false);

	if (!description) return null;

	return (
		<div className="relative mt-5">
			<p
				className={cn(
					"max-w-[108ch] text-[var(--book-hero-muted)] text-sm leading-relaxed transition-all",
					!expanded && "line-clamp-3 md:line-clamp-4",
				)}
			>
				{description}
			</p>
			{description.length > 200 && (
				<Button
					variant="link"
					size="xs"
					onClick={() => setExpanded(!expanded)}
					className="mt-1 px-0 text-[var(--book-hero-text)]"
				>
					{expanded ? "Show less" : "Read more"}
				</Button>
			)}
		</div>
	);
}

export type DetailListRow = {
	key?: string;
	label: string;
	value: ReactNode;
	valueClassName?: string;
};

export function DetailListSection({
	title,
	rows,
}: {
	title: string;
	rows: DetailListRow[];
}) {
	if (rows.length === 0) return null;

	return (
		<section className="space-y-4">
			<h3 className="font-semibold text-base text-foreground">{title}</h3>
			<dl className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-[140px_minmax(0,1fr)_140px_minmax(0,1fr)]">
				{rows.map((row) => (
					<div
						key={row.key ?? row.label}
						className="flex flex-col gap-1.5 md:contents"
					>
						<dt className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
							{row.label}
						</dt>
						<dd
							className={cn(
								"min-w-0 break-words text-foreground text-sm leading-relaxed",
								row.valueClassName,
							)}
						>
							{row.value}
						</dd>
					</div>
				))}
			</dl>
		</section>
	);
}
