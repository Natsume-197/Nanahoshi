import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type FilterChipOption<TValue extends string> = {
	value: TValue;
	label: ReactNode;
};

const CHIP_SKELETON_WIDTHS = ["w-16", "w-20", "w-24", "w-20"];

/** Holds the chip row's height while the data that decides its options loads. */
export function FilterChipsSkeleton({ count }: { count: number }) {
	const chips = Array.from({ length: count }, (_, index) => ({
		id: `chip-skeleton-${index}`,
		width: CHIP_SKELETON_WIDTHS[index % CHIP_SKELETON_WIDTHS.length],
	}));

	return (
		<div className="flex items-center gap-2" aria-hidden>
			{chips.map(({ id, width }) => (
				<Skeleton key={id} className={cn("h-9 rounded-full", width)} />
			))}
		</div>
	);
}

export function FilterChips<TValue extends string>({
	value,
	options,
	onValueChange,
}: {
	value: TValue;
	options: ReadonlyArray<FilterChipOption<TValue>>;
	onValueChange: (value: TValue) => void;
}) {
	return (
		<div className="flex items-center gap-2">
			{options.map((option) => {
				const active = value === option.value;
				return (
					<button
						key={option.value}
						type="button"
						aria-pressed={active}
						onClick={() => onValueChange(option.value)}
						className={cn(
							"h-9 rounded-full px-4 font-medium text-sm transition-colors",
							active
								? "bg-foreground text-background"
								: "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
