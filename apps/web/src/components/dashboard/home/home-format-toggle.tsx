import type { JSX } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { type HomeScope, setHomeScope } from "@/lib/home-scope-store";
import { m } from "@/paraglide/messages";

const options = [
	{ scope: "all", label: m["home.scope_all"] },
	{ scope: "books", label: m["home.scope_books"] },
	{ scope: "audiobooks", label: m["home.scope_audiobooks"] },
] as const satisfies readonly { scope: HomeScope; label: () => string }[];

/**
 * In-page format switch for the home dashboard. Format is a facet, not a nav
 * split — so the picker lives here beside the content it scopes. The options
 * form one segmented control because they are mutually exclusive, rather than
 * independent filter chips. A format with no items is hidden; the toggle
 * disappears entirely when only one format exists.
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
		<ToggleGroup
			value={[scope]}
			onValueChange={(values) => {
				const nextScope = values[0] as HomeScope | undefined;
				if (nextScope) setHomeScope(nextScope);
			}}
			variant="segmented"
			spacing={1}
			aria-label={m["home.scope_label"]()}
			className="min-w-0 flex-1 sm:max-w-xs"
		>
			{available.map(({ scope: value, label }) => (
				<ToggleGroupItem key={value} value={value}>
					{label()}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
