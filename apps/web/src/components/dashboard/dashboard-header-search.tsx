import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	ArrowRight,
	Clock,
	Library,
	Search,
	User,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useRecentSearches } from "@/hooks/use-recent-searches";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { formatNames } from "@/utils/format";
import { orpc } from "@/utils/orpc";

const MAX_DROPDOWN_BOOKS = 5;
const MAX_DROPDOWN_AUTHORS = 3;
const MAX_DROPDOWN_SERIES = 3;
const HEADER_SEARCH_MIN_QUERY_LENGTH = 1;
const HEADER_SEARCH_DEBOUNCE_MS = 300;
const LISTBOX_ID = "search-listbox";
const SEARCH_SKELETON_KEYS = ["sk-1", "sk-2", "sk-3"];
const SEARCH_PATHNAME = "/dashboard/search";

type SearchOption =
	| { kind: "recent"; query: string }
	| { kind: "author"; id: number; name: string; bookCount: number }
	| { kind: "series"; id: number; name: string; cover: string | null }
	| {
			kind: "book";
			uuid: string;
			title: string | null;
			filename: string;
			cover: string | null;
			authors?: { name: string }[];
	  }
	| { kind: "see-all" };

function isEditableTarget(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el) return false;
	return (
		el.tagName === "INPUT" ||
		el.tagName === "TEXTAREA" ||
		el.tagName === "SELECT" ||
		el.isContentEditable
	);
}

export function DashboardHeaderSearch() {
	const navigate = useNavigate();
	const location = useLocation();
	const { recent, add: addRecent, remove: removeRecent } = useRecentSearches();
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [mobileExpanded, setMobileExpanded] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const [isMac, setIsMac] = useState(false);

	// Mirror the route into the input: it keeps whatever was searched while on
	// the results page and clears only when navigating elsewhere. Tracked via a
	// render-phase ref so it never resyncs mid-typing — pathname/q change on
	// navigation, not on keystrokes.
	const routeQuery =
		location.pathname === SEARCH_PATHNAME
			? ((location.search as { q?: string }).q ?? "")
			: "";
	const routeKey = `${location.pathname}::${routeQuery}`;
	const prevRouteKeyRef = useRef<string | null>(null);
	if (prevRouteKeyRef.current !== routeKey) {
		prevRouteKeyRef.current = routeKey;
		setQuery(routeQuery);
	}

	const normalizedQuery = query.trim();
	const debouncedQuery = useDebounce(
		normalizedQuery,
		HEADER_SEARCH_DEBOUNCE_MS,
	);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const shouldSearch =
		open && debouncedQuery.length >= HEADER_SEARCH_MIN_QUERY_LENGTH;
	const mode: "search" | "recent" =
		normalizedQuery.length > 0 ? "search" : "recent";

	const { data: booksResult, isFetching: isBooksFetching } = useQuery({
		...orpc.books.search.queryOptions({
			input: { query: debouncedQuery, limit: MAX_DROPDOWN_BOOKS },
		}),
		enabled: shouldSearch,
		staleTime: 60_000,
	});
	const { data: authorsResult, isFetching: isAuthorsFetching } = useQuery({
		...orpc.authors.search.queryOptions({
			input: { query: debouncedQuery, limit: MAX_DROPDOWN_AUTHORS },
		}),
		enabled: shouldSearch,
		staleTime: 60_000,
	});
	const { data: seriesResult, isFetching: isSeriesFetching } = useQuery({
		...orpc.series.search.queryOptions({
			input: { query: debouncedQuery, limit: MAX_DROPDOWN_SERIES },
		}),
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const dropdownBooks = booksResult?.books?.slice(0, MAX_DROPDOWN_BOOKS) ?? [];
	const dropdownAuthors = authorsResult?.slice(0, MAX_DROPDOWN_AUTHORS) ?? [];
	const dropdownSeries = seriesResult?.slice(0, MAX_DROPDOWN_SERIES) ?? [];

	// Pending covers the debounce window too: the user has typed enough but we're
	// either still waiting for the debounce to fire or actively fetching. Without
	// the debounce check the dropdown would briefly collapse after each keystroke.
	const isSearchPending =
		normalizedQuery.length >= HEADER_SEARCH_MIN_QUERY_LENGTH &&
		(isBooksFetching ||
			isAuthorsFetching ||
			isSeriesFetching ||
			debouncedQuery !== normalizedQuery);

	const resultCount =
		dropdownAuthors.length + dropdownSeries.length + dropdownBooks.length;
	const hasResults = !isSearchPending && resultCount > 0;
	const noResults =
		!isSearchPending &&
		shouldSearch &&
		resultCount === 0 &&
		booksResult?.books != null;

	// Flat options list drives keyboard navigation; render order matches it.
	const options: SearchOption[] =
		mode === "recent"
			? recent.map((q) => ({ kind: "recent", query: q }))
			: hasResults
				? [
						...dropdownSeries.map((s) => ({
							kind: "series" as const,
							id: s.id,
							name: s.name,
							cover: s.cover,
						})),
						...dropdownBooks.map((b) => ({
							kind: "book" as const,
							uuid: b.uuid,
							title: b.title ?? null,
							filename: b.filename,
							cover: b.cover ?? null,
							authors: b.authors ?? undefined,
						})),
						...dropdownAuthors.map((a) => ({
							kind: "author" as const,
							id: a.id,
							name: a.name,
							bookCount: a.bookCount,
						})),
						{ kind: "see-all" as const },
					]
				: [];
	const totalOptions = options.length;

	const showDropdown =
		open && (normalizedQuery.length > 0 || recent.length > 0);

	const prevDebouncedQueryRef = useRef(debouncedQuery);
	if (debouncedQuery !== prevDebouncedQueryRef.current) {
		prevDebouncedQueryRef.current = debouncedQuery;
		setActiveIndex(-1);
	}

	const openRef = useRef(open);
	openRef.current = open;

	function focusSearch() {
		setOpen(true);
		// On mobile the input lives in the expandable overlay; on desktop it's
		// always visible (and expanding would steal the click-outside container).
		if (
			typeof window !== "undefined" &&
			window.matchMedia("(max-width: 767px)").matches
		) {
			setMobileExpanded(true);
		}
		requestAnimationFrame(() => inputRef.current?.focus());
	}

	useMountEffect(() => {
		setIsMac(
			typeof navigator !== "undefined" &&
				/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent),
		);

		function handleClickOutside(e: MouseEvent) {
			if (!openRef.current) return;
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
				setActiveIndex(-1);
			}
		}

		// Cmd/Ctrl+K (anywhere) and "/" (when not already typing) focus the search.
		// Capture phase so it beats browser-level shortcuts (e.g. Ctrl+K → browser
		// search bar) before they steal focus.
		function handleShortcut(e: KeyboardEvent) {
			const isCmdK =
				(e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k";
			const isSlash =
				e.key === "/" &&
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey &&
				!isEditableTarget(e.target);
			if (isCmdK || isSlash) {
				e.preventDefault();
				e.stopPropagation();
				focusSearch();
			}
		}

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleShortcut, { capture: true });
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleShortcut, {
				capture: true,
			});
		};
	});

	function resetAndClose() {
		setOpen(false);
		setQuery("");
		setActiveIndex(-1);
		setMobileExpanded(false);
	}

	function runSearch(value: string) {
		const q = value.trim();
		if (!q) return;
		addRecent(q);
		setOpen(false);
		setActiveIndex(-1);
		setMobileExpanded(false);
		navigate({ to: "/dashboard/search", search: { q } });
	}

	function handleBookClick(uuid: string) {
		resetAndClose();
		navigate({ to: "/dashboard/books/$uuid", params: { uuid } });
	}

	function commitOption(option: SearchOption) {
		switch (option.kind) {
			case "recent":
				runSearch(option.query);
				break;
			case "author":
				resetAndClose();
				navigate({
					to: "/dashboard/authors/$authorId",
					params: { authorId: String(option.id) },
				});
				break;
			case "series":
				resetAndClose();
				navigate({
					to: "/dashboard/series/$seriesName",
					params: { seriesName: option.name },
				});
				break;
			case "book":
				handleBookClick(option.uuid);
				break;
			case "see-all":
				runSearch(normalizedQuery);
				break;
		}
	}

	function handleClear() {
		setQuery("");
		setActiveIndex(-1);
		inputRef.current?.focus();
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		if (e.key === "Escape") {
			setOpen(false);
			setActiveIndex(-1);
			setMobileExpanded(false);
			inputRef.current?.blur();
			return;
		}
		if (!showDropdown || totalOptions === 0) {
			if (
				e.key === "Enter" &&
				normalizedQuery.length >= HEADER_SEARCH_MIN_QUERY_LENGTH
			) {
				runSearch(normalizedQuery);
			}
			return;
		}
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setActiveIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
				break;
			case "ArrowUp":
				e.preventDefault();
				setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
				break;
			case "Enter":
				e.preventDefault();
				if (activeIndex >= 0 && activeIndex < totalOptions) {
					commitOption(options[activeIndex]);
				} else if (normalizedQuery.length >= HEADER_SEARCH_MIN_QUERY_LENGTH) {
					runSearch(normalizedQuery);
				}
				break;
		}
	}

	const activeDescendant =
		activeIndex >= 0 ? `search-option-${activeIndex}` : undefined;

	// Flat-index offsets so each group's rows map to the right option index.
	// Render order: Series, Books, Authors (authors last), then See all.
	const bookBase = dropdownSeries.length;
	const authorBase = bookBase + dropdownBooks.length;
	const seeAllIndex = authorBase + dropdownAuthors.length;

	const rowClass = (index: number) =>
		cn(
			"flex w-full items-center gap-3 px-3 py-2 text-left transition-colors",
			index === activeIndex ? "bg-foreground/10" : "hover:bg-foreground/10",
		);

	const thumb = (cover: string | null, fallback: React.ReactNode) => {
		const filename = getCoverFilename(cover);
		return (
			<div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
				{filename ? (
					<img
						src={getCoverPresetUrl(filename, coverPresets.thumbnail)}
						srcSet={getCoverSrcSet(filename, coverPresets.thumbnail.widths)}
						sizes={coverPresets.thumbnail.sizes}
						alt=""
						className="h-full w-full object-cover"
						loading="lazy"
						decoding="async"
						width={80}
						height={120}
					/>
				) : (
					fallback
				)}
			</div>
		);
	};

	const searchInput = (
		<div className="relative">
			<Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
			<Input
				ref={inputRef}
				type="search"
				role="combobox"
				aria-expanded={showDropdown}
				aria-controls={LISTBOX_ID}
				aria-activedescendant={activeDescendant}
				aria-autocomplete="list"
				placeholder={m["search.placeholder"]()}
				value={query}
				onChange={(e) => {
					setQuery(e.target.value);
					setOpen(true);
					setActiveIndex(-1);
				}}
				onFocus={() => setOpen(true)}
				onKeyDown={handleKeyDown}
				autoComplete="off"
				className="h-9 rounded-full border-border/50 bg-muted/40 pr-16 pl-9 text-sm placeholder:text-muted-foreground/60 focus-visible:border-foreground/40 focus-visible:bg-muted/60 focus-visible:ring-foreground/10 [&::-webkit-search-cancel-button]:hidden"
			/>
			{query.length > 0 ? (
				<button
					type="button"
					onClick={handleClear}
					aria-label={m["common.clear_search"]()}
					className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
				>
					<X className="size-4" />
				</button>
			) : (
				<kbd className="pointer-events-none absolute top-1/2 right-2.5 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-border/60 bg-muted/60 px-1.5 py-0.5 font-medium font-sans text-[10px] text-muted-foreground/70 md:flex">
					{isMac ? "⌘K" : "Ctrl K"}
				</kbd>
			)}
		</div>
	);

	const dropdown = showDropdown ? (
		<div
			id={LISTBOX_ID}
			role="listbox"
			aria-label={m["search.results"]()}
			className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-black/20 shadow-xl"
		>
			{/* Recent searches (empty query) */}
			{mode === "recent" && recent.length > 0 && (
				<div className="py-1.5">
					<div className="px-3 pt-1 pb-1">
						<span className="font-medium text-[11px] text-muted-foreground/70 uppercase tracking-wide">
							{m["search.recent_searches"]()}
						</span>
					</div>
					{recent.map((q, index) => (
						<div
							key={q}
							className={cn(
								"group flex items-center transition-colors",
								index === activeIndex
									? "bg-foreground/10"
									: "hover:bg-foreground/10",
							)}
						>
							<button
								id={`search-option-${index}`}
								role="option"
								aria-selected={index === activeIndex}
								type="button"
								onClick={() => runSearch(q)}
								onPointerEnter={() => setActiveIndex(index)}
								className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
							>
								<Clock className="size-4 shrink-0 text-muted-foreground/60" />
								<span className="min-w-0 flex-1 truncate text-sm">{q}</span>
							</button>
							<button
								type="button"
								aria-label={m["search.remove_recent"]({ query: q })}
								onClick={() => removeRecent(q)}
								className={cn(
									"mr-2 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 opacity-0 transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100",
									index === activeIndex && "opacity-100",
								)}
							>
								<X className="size-3.5" />
							</button>
						</div>
					))}
				</div>
			)}

			{/* Search results */}
			{mode === "search" && (
				<>
					{isSearchPending && (
						<div className="py-1.5" aria-busy="true" aria-live="polite">
							<span className="sr-only">{m["book.searching"]()}</span>
							{SEARCH_SKELETON_KEYS.map((key) => (
								<div
									key={key}
									className="flex w-full items-center gap-3 px-3 py-2"
								>
									<Skeleton className="size-10 shrink-0 rounded-md bg-foreground/10" />
									<div className="min-w-0 flex-1 space-y-1.5">
										<Skeleton className="h-3.5 w-3/4 rounded bg-foreground/10" />
										<Skeleton className="h-3 w-2/5 rounded bg-foreground/10" />
									</div>
								</div>
							))}
						</div>
					)}

					{hasResults && (
						<div className="py-1.5">
							{dropdownSeries.map((s, i) => {
								const index = i;
								return (
									<button
										key={`series-${s.id}`}
										id={`search-option-${index}`}
										role="option"
										aria-selected={index === activeIndex}
										type="button"
										onClick={() =>
											commitOption({
												kind: "series",
												id: s.id,
												name: s.name,
												cover: s.cover,
											})
										}
										onPointerEnter={() => setActiveIndex(index)}
										className={rowClass(index)}
									>
										{thumb(
											s.cover,
											<Library className="size-4 text-muted-foreground/50" />,
										)}
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-sm">{s.name}</p>
											<p className="truncate text-muted-foreground text-xs">
												{m["nav.series"]()}
											</p>
										</div>
									</button>
								);
							})}

							{dropdownBooks.map((book, i) => {
								const index = bookBase + i;
								const displayTitle = book.title ?? book.filename;
								const authorText = formatNames(book.authors);
								return (
									<button
										key={book.uuid}
										id={`search-option-${index}`}
										role="option"
										aria-selected={index === activeIndex}
										type="button"
										onClick={() => handleBookClick(book.uuid)}
										onPointerEnter={() => setActiveIndex(index)}
										className={rowClass(index)}
									>
										{thumb(
											book.cover ?? null,
											<span className="text-[10px] text-muted-foreground">
												{m["book.no_cover"]()}
											</span>,
										)}
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-sm">
												{displayTitle}
											</p>
											<p className="truncate text-muted-foreground text-xs">
												{authorText
													? `${m["media.book"]()} · ${authorText}`
													: m["media.book"]()}
											</p>
										</div>
									</button>
								);
							})}

							{dropdownAuthors.map((a, i) => {
								const index = authorBase + i;
								return (
									<button
										key={`author-${a.id}`}
										id={`search-option-${index}`}
										role="option"
										aria-selected={index === activeIndex}
										type="button"
										onClick={() =>
											commitOption({
												kind: "author",
												id: a.id,
												name: a.name,
												bookCount: a.bookCount,
											})
										}
										onPointerEnter={() => setActiveIndex(index)}
										className={rowClass(index)}
									>
										<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
											<User className="size-5 text-muted-foreground/50" />
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-sm">{a.name}</p>
											<p className="truncate text-muted-foreground text-xs">
												{m["common.author"]()}
											</p>
										</div>
									</button>
								);
							})}
						</div>
					)}

					{noResults && (
						<div
							className="px-4 py-3 text-muted-foreground text-sm"
							aria-live="polite"
						>
							{m["search.no_results_title"]({ query: debouncedQuery })}
						</div>
					)}

					{hasResults && (
						<div className="border-border/40 border-t">
							<button
								id={`search-option-${seeAllIndex}`}
								role="option"
								aria-selected={activeIndex === seeAllIndex}
								type="button"
								onClick={() => runSearch(normalizedQuery)}
								onPointerEnter={() => setActiveIndex(seeAllIndex)}
								className={cn(
									"flex w-full items-center justify-between px-4 py-2.5 text-left text-primary text-sm transition-colors",
									activeIndex === seeAllIndex
										? "bg-foreground/10"
										: "hover:bg-foreground/10",
								)}
							>
								<span>{m["search.see_all_results"]()}</span>
								<ArrowRight className="size-4" />
							</button>
						</div>
					)}
				</>
			)}
		</div>
	) : null;

	return (
		<>
			{/* Mobile: search icon button */}
			<Button
				variant="ghost"
				size="icon-lg"
				className="order-2 rounded-full text-muted-foreground md:order-none md:hidden [&_svg]:size-[18px]"
				onClick={() => {
					setMobileExpanded(true);
					requestAnimationFrame(() => inputRef.current?.focus());
				}}
				aria-label={m["common.search"]()}
			>
				<Search />
			</Button>

			{/* Mobile: expanded search overlay */}
			{mobileExpanded && (
				<div
					ref={containerRef}
					className="fixed inset-x-0 top-0 z-50 flex h-14 items-center gap-2 bg-background px-3 md:hidden"
				>
					<Button
						variant="ghost"
						size="icon-sm"
						onClick={() => {
							setMobileExpanded(false);
							setOpen(false);
							setQuery("");
							setActiveIndex(-1);
						}}
						aria-label={m["aria.close_search"]()}
					>
						<ArrowLeft className="size-5" />
					</Button>
					<div className="relative flex-1">
						{searchInput}
						{dropdown}
					</div>
				</div>
			)}

			{/* Desktop: always visible search bar */}
			<div
				ref={mobileExpanded ? undefined : containerRef}
				className="relative mx-auto hidden w-full max-w-md md:block"
			>
				{searchInput}
				{dropdown}
			</div>
		</>
	);
}
