import type { JSX } from "react";
import { FilterChips } from "@/components/shared/filter-chips";
import { type HomeScope, setHomeScope } from "@/lib/home-scope-store";
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

	// Sticky against the dashboard's <main> scroll container so the format
	// picker stays reachable while browsing; full-bleed negative margins undo
	// the page padding so the blur backdrop covers edge to edge.
	return (
		<div className="sticky top-0 z-20 -mx-4 bg-background/85 px-4 py-2.5 backdrop-blur-md md:-mx-6 md:px-6 lg:-mx-8 lg:px-8">
			<FilterChips
				value={scope}
				options={available.map(({ scope: value, label }) => ({
					value,
					label: label(),
				}))}
				onValueChange={setHomeScope}
			/>
		</div>
	);
}
