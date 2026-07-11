import type { JSX } from "react";
import { type HomeScope, setHomeScope } from "@/lib/home-scope-store";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const options = [
	{ scope: "all", label: m["home.scope_all"] },
	{ scope: "books", label: m["home.scope_books"] },
	{ scope: "audiobooks", label: m["home.scope_audiobooks"] },
] as const satisfies readonly { scope: HomeScope; label: () => string }[];

/**
 * In-page format switch for the home dashboard. Format is a facet, not a nav
 * split — so the picker lives here beside the content it scopes, as a pair of
 * filter chips rather than loose navbar tabs. A format with no items is hidden;
 * the toggle disappears entirely when only one format exists.
 */
export function HomeFormatToggle({
	scope,
	hasBooks,
	hasAudiobooks,
}: {
	scope: HomeScope;
	hasBooks: boolean;
	hasAudiobooks: boolean;
}): JSX.Element | null {
	const available = options.filter(({ scope: value }) =>
		value === "all"
			? hasBooks && hasAudiobooks
			: value === "books"
				? hasBooks
				: hasAudiobooks,
	);

	if (available.length < 2) return null;

	return (
		<div className="flex items-center gap-2">
			{available.map(({ scope: value, label }) => {
				const active = scope === value;
				return (
					<button
						key={value}
						type="button"
						aria-pressed={active}
						onClick={() => setHomeScope(value)}
						className={cn(
							"h-9 rounded-full px-4 font-medium text-sm transition-colors",
							active
								? "bg-foreground text-background"
								: "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						{label()}
					</button>
				);
			})}
		</div>
	);
}
