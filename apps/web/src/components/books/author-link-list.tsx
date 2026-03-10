import { Link } from "@tanstack/react-router";
import { Fragment } from "react";
import { cn } from "@/lib/utils";

type AuthorLink = {
	id?: number | null;
	name: string;
	role?: string | null;
};

interface AuthorLinkListProps {
	authors?: AuthorLink[] | null;
	withRole?: boolean;
	className?: string;
	linkClassName?: string;
	separatorClassName?: string;
}

export function AuthorLinkList({
	authors,
	withRole = false,
	className,
	linkClassName,
	separatorClassName,
}: AuthorLinkListProps) {
	if (!authors?.length) return null;

	return (
		<span className={cn("inline-flex flex-wrap items-center gap-x-1", className)}>
			{authors.map((author, index) => {
				const label =
					withRole && author.role && author.role !== "Author"
						? `${author.name} (${author.role})`
						: author.name;
				const canLink = author.id != null;

				return (
					<Fragment
						key={`${author.id ?? author.name}-${author.role ?? "Author"}-${index}`}
					>
						{index > 0 ? (
							<span className={cn("text-muted-foreground/70", separatorClassName)}>
								, 
							</span>
						) : null}
						{canLink ? (
							<Link
								to="/dashboard/authors/$authorId"
								params={{ authorId: String(author.id) }}
								className={cn(
									"hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
									linkClassName,
								)}
							>
								{label}
							</Link>
						) : (
							<span>{label}</span>
						)}
					</Fragment>
				);
			})}
		</span>
	);
}
