import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PAGE_GUTTER } from "@/lib/page-layout";
import { cn } from "@/lib/utils";

interface CategorySelectorItem<Value extends string> {
	value: Value;
	label: () => string;
}

export function CategorySelector<Value extends string>({
	value,
	items,
	onValueChange,
	ariaLabel,
}: {
	value: Value;
	items: readonly CategorySelectorItem<Value>[];
	onValueChange: (value: Value) => void;
	ariaLabel: string;
}) {
	return (
		<div className="scrollbar-none shrink-0 overflow-x-auto overscroll-x-contain bg-background">
			<ToggleGroup
				value={[value]}
				onValueChange={(values) => {
					const next = values[0] as Value | undefined;
					if (next) onValueChange(next);
				}}
				variant="category"
				size="category"
				spacing={3}
				aria-label={ariaLabel}
				className={cn(PAGE_GUTTER, "min-w-max pt-5 pb-2 md:pt-6")}
			>
				{items.map((item) => (
					<ToggleGroupItem key={item.value} value={item.value}>
						{item.label()}
					</ToggleGroupItem>
				))}
			</ToggleGroup>
		</div>
	);
}
