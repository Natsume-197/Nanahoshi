import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export function SynopsisSection({
	description,
	title,
}: {
	description?: string | null;
	title?: string;
}) {
	const [expanded, setExpanded] = useState(false);

	if (!description) return null;

	const canToggle = description.length > 200;
	const collapsed = canToggle && !expanded;

	return (
		<div className="relative mt-5">
			{/* Matches the ScrollSection header so every section in the column
			    reads at the same level. */}
			{title && <h2 className="mb-4 font-bold text-[1.375rem]">{title}</h2>}
			<p
				className={cn(
					"max-w-[108ch] text-[var(--book-hero-muted)] text-sm leading-relaxed transition-all",
					// Soft fade on the last line while collapsed, in place of a hard cut.
					collapsed &&
						"line-clamp-3 [mask-image:linear-gradient(to_bottom,black_55%,transparent)] md:line-clamp-4",
				)}
			>
				{description}
			</p>
			{canToggle && (
				<Button
					variant="link"
					size="xs"
					onClick={() => setExpanded(!expanded)}
					className="mt-1 px-0 text-[var(--book-hero-text)]"
				>
					{expanded ? m["book.show_less"]() : m["book.read_more"]()}
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
			<h2 className="font-bold text-[1.375rem]">{title}</h2>
			{/* Spec sheet: fixed label column on sm+, stacked on mobile. */}
			<dl className="divide-y divide-border/60 rounded-xl border border-border/60 bg-muted/30">
				{rows.map((row) => (
					<div
						key={row.key ?? row.label}
						className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6"
					>
						<dt className="shrink-0 text-muted-foreground text-sm sm:w-36">
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
