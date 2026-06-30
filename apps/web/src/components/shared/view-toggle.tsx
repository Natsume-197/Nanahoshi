import { LayoutGrid, List } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "grid" | "list";

/** Grid/list segmented toggle shared by the likes and series pages. */
export function ViewToggle({
	view,
	onChange,
	fullWidth = false,
	className,
}: {
	view: ViewMode;
	onChange: (next: ViewMode) => void;
	fullWidth?: boolean;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex items-center gap-0.5 rounded-2xl bg-input/50 p-1",
				fullWidth ? "w-full" : "w-fit",
				className,
			)}
		>
			<button
				type="button"
				aria-label="Grid view"
				aria-pressed={view === "grid"}
				onClick={() => onChange("grid")}
				className={cn(
					"flex h-7 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					fullWidth ? "flex-1" : "size-7",
					view === "grid"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<LayoutGrid className="size-4" />
			</button>
			<button
				type="button"
				aria-label="List view"
				aria-pressed={view === "list"}
				onClick={() => onChange("list")}
				className={cn(
					"flex h-7 items-center justify-center rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
					fullWidth ? "flex-1" : "size-7",
					view === "list"
						? "bg-background text-foreground shadow-sm"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<List className="size-4" />
			</button>
		</div>
	);
}
