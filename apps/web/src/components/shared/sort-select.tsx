import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export interface SortOption<T extends string> {
	value: T;
	label: string;
}

/** Sort dropdown shared by collection pages (likes, series). */
export function SortSelect<T extends string>({
	value,
	onChange,
	options,
	ariaLabel,
}: {
	value: T;
	onChange: (value: T) => void;
	options: readonly SortOption<T>[];
	ariaLabel: string;
}) {
	const current = options.find((option) => option.value === value);
	return (
		<Select value={value} onValueChange={(next) => onChange(next as T)}>
			<SelectTrigger aria-label={ariaLabel}>
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
