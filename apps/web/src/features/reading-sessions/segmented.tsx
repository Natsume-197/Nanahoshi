import { cn } from "@/lib/utils";

export function Segmented<Value extends string>({
	label,
	value,
	options,
	onChange,
}: {
	label: string;
	value: Value;
	options: { value: Value; label: () => string }[];
	onChange: (value: Value) => void;
}) {
	return (
		<fieldset
			aria-label={label}
			className="flex max-w-full gap-0.5 rounded-xl bg-foreground/[0.05] p-0.5"
		>
			{options.map((option) => (
				<button
					type="button"
					key={option.value}
					aria-pressed={value === option.value}
					onClick={() => onChange(option.value)}
					className={cn(
						"min-h-8 rounded-[10px] px-3 text-xs transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none",
						value === option.value
							? "bg-background font-medium text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{option.label()}
				</button>
			))}
		</fieldset>
	);
}
