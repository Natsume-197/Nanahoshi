import { Link } from "@tanstack/react-router";
import { ArrowDownToLine, CloudOff } from "lucide-react";
import { type JSX, memo, useState } from "react";
import { BookContextMenuRoot } from "@/components/books/book-context-menu";
import { Button } from "@/components/ui/button";
import { useCachedBooks } from "@/hooks/use-cached-books";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { AudiobookSeriesSection } from "./audiobook-series-section";
import { BookSeriesSection } from "./book-series-section";
import { ContinueListeningSection } from "./continue-listening-section";
import { ContinueReadingSection } from "./continue-reading-section";
import { RandomAudiobooksSection } from "./random-audiobooks-section";
import { RandomBooksSection } from "./random-books-section";
import { RecentlyAddedAudiobooksSection } from "./recently-added-audiobooks-section";
import { RecentlyAddedSection } from "./recently-added-section";

type HomeScope = "books" | "audiobooks";

const HOME_SCOPE_KEY = "nanahoshi-home-scope";

function readStoredScope(): HomeScope {
	if (typeof window === "undefined") return "books";
	return window.localStorage.getItem(HOME_SCOPE_KEY) === "audiobooks"
		? "audiobooks"
		: "books";
}

function OfflineHomeNotice() {
	const { data: books } = useCachedBooks();
	const count = books?.length ?? 0;

	return (
		<div className="flex flex-col items-center gap-3 py-24 text-center">
			<CloudOff
				className="size-12 text-muted-foreground/40"
				strokeWidth={1.5}
			/>
			<p className="font-medium text-lg">{m["home.offline_title"]()}</p>
			<p className="max-w-sm text-muted-foreground text-sm">
				{count > 0
					? m["home.offline_ready"]({ count })
					: m["home.offline_empty"]()}
			</p>
			{count > 0 && (
				<Button asChild className="mt-2">
					<Link to="/dashboard/downloads">
						<ArrowDownToLine className="size-4" />
						{m["home.view_downloads"]()}
					</Link>
				</Button>
			)}
		</div>
	);
}

function ScopeChips({
	scope,
	onScopeChange,
}: {
	scope: HomeScope;
	onScopeChange: (scope: HomeScope) => void;
}) {
	return (
		<div
			role="tablist"
			aria-label={m["nav.home"]()}
			className="inline-flex items-center gap-1 rounded-full bg-muted/60 p-1"
		>
			<ScopeChip
				active={scope === "books"}
				onClick={() => onScopeChange("books")}
				label={m["home.scope_books"]()}
			/>
			<ScopeChip
				active={scope === "audiobooks"}
				onClick={() => onScopeChange("audiobooks")}
				label={m["home.scope_audiobooks"]()}
			/>
		</div>
	);
}

function ScopeChip({
	active,
	onClick,
	label,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
}) {
	return (
		<button
			type="button"
			role="tab"
			aria-selected={active}
			onClick={onClick}
			className={cn(
				"rounded-full px-4 py-1.5 font-medium text-sm transition-colors",
				active
					? "bg-white text-neutral-900 shadow-sm"
					: "text-muted-foreground hover:text-foreground",
			)}
		>
			{label}
		</button>
	);
}

export const DashboardHomeContent = memo(
	function DashboardHomeContent(): JSX.Element {
		const online = useOnlineStatus();
		const [scope, setScopeState] = useState<HomeScope>(readStoredScope);

		const setScope = (next: HomeScope) => {
			setScopeState(next);
			if (typeof window !== "undefined") {
				window.localStorage.setItem(HOME_SCOPE_KEY, next);
			}
		};

		if (!online) {
			return <OfflineHomeNotice />;
		}

		return (
			<BookContextMenuRoot>
				<div className="relative space-y-6 px-3 py-6 md:px-6 md:py-6 lg:px-8 lg:py-8">
					<ScopeChips scope={scope} onScopeChange={setScope} />
					{scope === "books" ? (
						<div className="space-y-8">
							<ContinueReadingSection />
							<RecentlyAddedSection />
							<BookSeriesSection />
							<RandomBooksSection />
						</div>
					) : (
						<div className="space-y-8">
							<ContinueListeningSection />
							<RecentlyAddedAudiobooksSection />
							<AudiobookSeriesSection />
							<RandomAudiobooksSection />
						</div>
					)}
				</div>
			</BookContextMenuRoot>
		);
	},
);
