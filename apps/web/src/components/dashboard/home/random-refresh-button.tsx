import type { JSX } from "react";
import { m } from "@/paraglide/messages";

/** Reshuffles a random rail. Styled to sit next to ScrollSection's "show all". */
export function RandomRefreshButton({
	disabled,
	onRefresh,
	sectionTitle,
}: {
	disabled: boolean;
	onRefresh: () => void;
	sectionTitle: string;
}): JSX.Element {
	return (
		<button
			type="button"
			onClick={onRefresh}
			disabled={disabled}
			className="relative inline-flex h-7 items-center whitespace-nowrap rounded-sm font-semibold text-foreground/80 text-sm transition-colors after:absolute after:inset-x-0 after:-inset-y-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
		>
			{m["home.refresh"]()}
			<span className="sr-only">: {sectionTitle}</span>
		</button>
	);
}
