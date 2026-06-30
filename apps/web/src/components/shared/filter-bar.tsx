import type { ReactNode } from "react";
import {
	Combobox,
	ComboboxChip,
	ComboboxChips,
	ComboboxChipsInput,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxItem,
	ComboboxList,
	ComboboxValue,
	useComboboxAnchor,
} from "@/components/ui/combobox";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * AniList-style filter row: each control sits under a small uppercase label and
 * flows into as many responsive columns as the available width can hold.
 */
export function FilterBar({ children }: { children: ReactNode }) {
	return (
		<div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,10rem),1fr))] items-end gap-3 sm:gap-4">
			{children}
		</div>
	);
}

/** A labeled cell in the {@link FilterBar}. */
export function FilterField({
	label,
	children,
	className,
}: {
	label: string;
	children: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
			<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
				{label}
			</span>
			{children}
		</div>
	);
}

export interface FilterOption {
	value: string;
	label: string;
}

/**
 * Single-select dropdown for the filter bar. Use a sentinel option (e.g.
 * `{ value: "any", label: "Any" }`) for the unfiltered state — Radix selects
 * cannot represent an empty value.
 */
export function FilterSelect({
	value,
	onChange,
	options,
	ariaLabel,
}: {
	value: string;
	onChange: (value: string) => void;
	options: readonly FilterOption[];
	ariaLabel: string;
}) {
	const current = options.find((option) => option.value === value);
	return (
		<Select value={value} onValueChange={onChange}>
			<SelectTrigger aria-label={ariaLabel} className="w-full">
				<SelectValue>{current?.label}</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{options.map((option) => (
					<SelectItem key={option.value} value={option.value}>
						{option.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

/**
 * Multi-select combobox (chips + searchable list) for the filter bar, e.g.
 * genres. Built on the shadcn/Base UI combobox.
 */
export function MultiFilterSelect({
	value,
	options,
	onChange,
	ariaLabel,
	placeholder = "Any",
	emptyLabel = "No matches.",
}: {
	value: string[];
	options: readonly string[];
	onChange: (next: string[]) => void;
	ariaLabel: string;
	placeholder?: string;
	emptyLabel?: string;
}) {
	const anchorRef = useComboboxAnchor();
	return (
		<Combobox
			items={options as string[]}
			multiple
			value={value}
			onValueChange={onChange}
		>
			<ComboboxChips ref={anchorRef} aria-label={ariaLabel}>
				<ComboboxValue>
					{(selected: string[]) => (
						<>
							{selected.map((item) => (
								<ComboboxChip key={item}>{item}</ComboboxChip>
							))}
							<ComboboxChipsInput
								placeholder={selected.length === 0 ? placeholder : ""}
							/>
						</>
					)}
				</ComboboxValue>
			</ComboboxChips>
			<ComboboxContent anchor={anchorRef}>
				<ComboboxEmpty>{emptyLabel}</ComboboxEmpty>
				<ComboboxList>
					{(item: string) => (
						<ComboboxItem key={item} value={item}>
							{item}
						</ComboboxItem>
					)}
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	);
}
