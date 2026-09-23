import { CaretRight } from "@phosphor-icons/react";
import { Link, type LinkProps } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const titleClass =
	"flex h-10 min-w-0 items-center gap-1 rounded-lg ps-[calc(var(--rail-row-inset)+11px)] pe-2 font-semibold text-base text-sidebar-foreground";

/**
 * Section title under a divider, YouTube style: sentence case, bold, starting
 * on the navigation icons' left edge (a 22px icon centred in the 44px column). With `to`, the title links to the section's own page and carries
 * a chevron. `actions` sit at the trailing edge of the same row. Expanded only.
 */
export function RailSectionTitle({
	label,
	to,
	search,
	actions,
}: {
	label: string;
	to?: LinkProps["to"];
	search?: LinkProps["search"];
	actions?: ReactNode;
}): ReactNode {
	return (
		<div className="mt-3 rail-expanded:flex hidden w-full shrink-0 items-center gap-1 pe-1">
			{to ? (
				<Link
					to={to}
					search={search}
					preload="intent"
					className={cn(
						titleClass,
						"transition-colors duration-150 ease-out-quart hover:bg-sidebar-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
					)}
				>
					<h2 className="truncate">{label}</h2>
					<CaretRight weight="bold" className="size-4 shrink-0" />
				</Link>
			) : (
				<h2 className={cn(titleClass, "truncate")}>{label}</h2>
			)}
			{actions && (
				<div className="ms-auto flex shrink-0 items-center gap-1">
					{actions}
				</div>
			)}
		</div>
	);
}
