import type { JSX } from "react";
import {
	type HomeScope,
	setHomeScope,
	useHomeScope,
} from "@/lib/home-scope-store";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const options = [
	{ scope: "books", label: m["home.scope_books"] },
	{ scope: "audiobooks", label: m["home.scope_audiobooks"] },
] as const satisfies readonly { scope: HomeScope; label: () => string }[];

/**
 * In-page format switch for the home dashboard. Format is a facet, not a nav
 * split — so the picker lives here beside the content it scopes, as a pair of
 * filter chips rather than loose navbar tabs.
 */
export function HomeFormatToggle(): JSX.Element {
	const scope = useHomeScope();

	return (
		<div className="flex items-center gap-2">
			{options.map(({ scope: value, label }) => {
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
