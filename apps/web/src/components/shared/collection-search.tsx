import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

/** Search input shared by collection pages (likes, series). Controlled. */
export function CollectionSearch({
	value,
	onChange,
	placeholder = m["common.search"](),
	ariaLabel = m["common.search"](),
	className,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	ariaLabel?: string;
	/** Override the default `w-full sm:w-56` width (e.g. full-width in a filter bar). */
	className?: string;
}) {
	return (
		<div className={cn("relative w-full sm:w-56", className)}>
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
					aria-label={m["common.clear_search"]()}
					onClick={() => onChange("")}
					className="absolute top-1/2 right-2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
				>
					<X className="size-3.5" />
				</button>
			) : null}
		</div>
	);
}
