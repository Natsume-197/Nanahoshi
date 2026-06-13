import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Search input shared by collection pages (likes, series). Controlled. */
export function CollectionSearch({
	value,
	onChange,
	placeholder = "Search…",
	ariaLabel = "Search",
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	ariaLabel?: string;
}) {
	return (
		<div className="relative w-full sm:w-56">
			<Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				type="search"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
				aria-label={ariaLabel}
				className="px-8 [&::-webkit-search-cancel-button]:appearance-none"
			/>
			{value ? (
				<button
					type="button"
					aria-label="Clear search"
					onClick={() => onChange("")}
					className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}
