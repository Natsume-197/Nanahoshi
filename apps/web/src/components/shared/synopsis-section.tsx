import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const MARKDOWN_LINK_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi;

function renderMarkdownLinks(value: string): ReactNode[] {
	const content: ReactNode[] = [];
	let previousIndex = 0;

	for (const match of value.matchAll(MARKDOWN_LINK_PATTERN)) {
		const matchIndex = match.index;
		const [source, label, href] = match;

		if (matchIndex > previousIndex) {
			content.push(value.slice(previousIndex, matchIndex));
		}

		content.push(
			<a
				key={`${href}-${matchIndex}`}
				href={href}
				target="_blank"
				rel="noopener noreferrer"
				className="font-medium text-primary underline decoration-primary/45 underline-offset-4 transition-colors hover:decoration-primary focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
			>
				{label}
				<span className="sr-only">— {m["common.open_new_tab"]()}</span>
			</a>,
		);

		previousIndex = matchIndex + source.length;
	}

	if (previousIndex < value.length) {
		content.push(value.slice(previousIndex));
	}

	return content;
}

export function SynopsisSection({
	description,
	title,
	className,
	descriptionClassName,
}: {
	description?: string | null;
	title?: string;
	className?: string;
	descriptionClassName?: string;
}) {
	const [expanded, setExpanded] = useState(false);
	const headingId = useId();
	const descriptionId = useId();

	if (!description) return null;

	const canToggle = description.length > 200;
	const collapsed = canToggle && !expanded;

	return (
		<section
			className={cn("relative mt-6", className)}
			aria-labelledby={title ? headingId : undefined}
		>
			{/* Matches the ScrollSection header so every section in the column
			    reads at the same level. */}
			{title && (
				<h2
					id={headingId}
					className="mb-4 text-pretty font-bold text-xl leading-tight"
				>
					{title}
				</h2>
			)}
			<p
				id={descriptionId}
				className={cn(
					"max-w-[70ch] whitespace-pre-line break-words text-[var(--book-hero-muted)] text-base leading-7",
					descriptionClassName,
					collapsed && "line-clamp-6",
				)}
			>
				{renderMarkdownLinks(description)}
			</p>
			{canToggle && (
				<Button
					variant="link"
					size="xs"
					onClick={() => setExpanded(!expanded)}
					aria-expanded={expanded}
					aria-controls={descriptionId}
					className="-ms-3 mt-1 h-10 px-3 text-[var(--book-hero-text)]"
				>
					{expanded ? m["book.show_less"]() : m["book.read_more"]()}
				</Button>
			)}
		</section>
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
	const headingId = useId();

	if (rows.length === 0) return null;

	return (
		<section className="flex flex-col gap-4" aria-labelledby={headingId}>
			<h2
				id={headingId}
				className="text-pretty font-bold text-[1.375rem] leading-tight"
			>
				{title}
			</h2>
			{/* Spec sheet: fixed label column on sm+, stacked on mobile. */}
			<dl className="divide-y divide-border/60 rounded-xl border border-border/60 bg-muted/30">
				{rows.map((row) => (
					<div
						key={row.key ?? row.label}
						className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:gap-6"
					>
						<dt className="shrink-0 font-medium text-muted-foreground text-sm sm:w-36">
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
