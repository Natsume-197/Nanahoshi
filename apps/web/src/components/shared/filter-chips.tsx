import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FilterChipOption<TValue extends string> = {
	value: TValue;
	label: ReactNode;
};

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
