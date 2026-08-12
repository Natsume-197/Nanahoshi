import { CircleNotch } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Page header shared by collection pages (likes, series, narrators): a large
 * title with an optional count/meta subtitle on the left and an actions slot
 * (search, view toggle, sort) on the right. Shows a small spinner next to the
 * title while a refetch (e.g. sort/search change) is in flight.
 */
export function CollectionToolbar({
	title,
	subtitle,
	actions,
	loading = false,
	titleSize = "compact",
}: {
	title: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
	loading?: boolean;
	titleSize?: "default" | "compact";
}) {
	return (
		<div className="flex flex-wrap items-end justify-between gap-4">
			<div className="space-y-1.5">
				<div className="flex items-center gap-2.5">
					<h1
						className={cn(
							"text-balance tracking-tight",
							titleSize === "compact"
								? "font-semibold text-2xl leading-tight md:text-3xl"
								: "font-bold text-3xl md:text-4xl",
						)}
					>
						{title}
					</h1>
					{loading ? (
						<CircleNotch
							aria-label="Loading"
							className="size-4 animate-spin text-muted-foreground"
						/>
					) : null}
				</div>
				{subtitle ? (
					<p className="text-muted-foreground text-sm">{subtitle}</p>
				) : null}
			</div>
			{actions ? (
				<div className="flex items-center gap-2">{actions}</div>
			) : null}
		</div>
	);
}
