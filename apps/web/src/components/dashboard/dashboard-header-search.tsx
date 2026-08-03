import {
	ArrowLeft,
	ArrowRight,
	Books,
	Clock,
	FolderOpen,
	MagnifyingGlass,
	User,
	X,
} from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "@/components/ui/input-group";
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
import { type TopHit, topSearchQueryOptions } from "@/utils/top-search";

const HEADER_SEARCH_MIN_QUERY_LENGTH = 1;
const HEADER_SEARCH_DEBOUNCE_MS = 300;
const LISTBOX_ID = "search-listbox";
const SEARCH_SKELETON_KEYS = ["sk-1", "sk-2", "sk-3"];
const SEARCH_PATHNAME = "/dashboard/search";

type SearchOption =
	| { kind: "recent"; query: string }
	| { kind: "hit"; hit: TopHit }
	| { kind: "see-all" };

function hitKey(hit: TopHit): string {
	switch (hit.type) {
		case "book":
		case "audiobook":
			return `${hit.type}-${hit.uuid}`;
		case "series":
		case "author":
			return `${hit.type}-${hit.uuid}`;
		case "collection":
			return `${hit.type}-${hit.id}`;
		case "user":
			return `user-${hit.username}`;
	}
}

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

	const { data: topHits, isFetching: isTopFetching } = useQuery({
		...topSearchQueryOptions(debouncedQuery),
		enabled: shouldSearch,
	});

	// Pending covers the debounce window too: the user has typed enough but we're
	// either still waiting for the debounce to fire or actively fetching. Without
	// the debounce check the dropdown would briefly collapse after each keystroke.
	const isSearchPending =
		normalizedQuery.length >= HEADER_SEARCH_MIN_QUERY_LENGTH &&
		(isTopFetching || debouncedQuery !== normalizedQuery);

	const hits = topHits ?? [];
	const hasResults = !isSearchPending && hits.length > 0;
	const noResults =
		!isSearchPending && shouldSearch && hits.length === 0 && topHits != null;

	// Flat options list drives keyboard navigation; render order matches it.
	const options: SearchOption[] =
		mode === "recent"
			? recent.map((q) => ({ kind: "recent", query: q }))
			: hasResults
				? [
						...hits.map((hit) => ({ kind: "hit" as const, hit })),
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

	function commitHit(hit: TopHit) {
		switch (hit.type) {
			case "book":
				handleBookClick(hit.uuid);
				break;
			case "audiobook":
				resetAndClose();
				navigate({
					to: "/dashboard/audiobooks/$uuid",
					params: { uuid: hit.uuid },
				});
				break;
			case "author":
				resetAndClose();
				navigate({
					to: "/dashboard/authors/$uuid",
					params: { uuid: hit.uuid },
				});
				break;
			case "series":
				resetAndClose();
				navigate({
					to: "/dashboard/series/$uuid",
					params: { uuid: hit.uuid },
				});
				break;
			case "collection":
				resetAndClose();
				navigate({
					to: "/dashboard/collections/$collectionId",
					params: { collectionId: hit.id },
				});
				break;
			case "user":
				if (!hit.username) break;
				resetAndClose();
				navigate({
					to: "/dashboard/user/$username",
					params: { username: hit.username },
				});
				break;
		}
	}

	function commitOption(option: SearchOption) {
		switch (option.kind) {
			case "recent":
				runSearch(option.query);
				break;
			case "hit":
				commitHit(option.hit);
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

	const seeAllIndex = hits.length;

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

	const hitVisual = (hit: TopHit): React.ReactNode => {
		switch (hit.type) {
			case "book":
			case "audiobook":
				return thumb(
					hit.cover,
					<span className="px-1 text-center text-muted-foreground text-xs leading-tight">
						{m["book.no_cover"]()}
					</span>,
				);
			case "series":
				return thumb(
					hit.cover,
					<Books className="size-4 text-muted-foreground/50" />,
				);
			case "author":
				return (
					<div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
						<User className="size-5 text-muted-foreground/50" />
					</div>
				);
			case "collection":
				return thumb(
					hit.previewCovers[0] ?? null,
					<FolderOpen className="size-4 text-muted-foreground/50" />,
				);
			case "user":
				return (
					<UserAvatar
						name={hit.displayUsername ?? hit.name}
						image={hit.image}
						className="size-10 shrink-0"
					/>
				);
		}
	};

	const hitTexts = (hit: TopHit): { title: string; subtitle: string } => {
		switch (hit.type) {
			case "book":
			case "audiobook": {
				const typeLabel =
					hit.type === "book" ? m["media.book"]() : m["media.audiobook"]();
				const authorText = formatNames(hit.authors);
				return {
					title: hit.title ?? hit.filename,
					subtitle: authorText ? `${typeLabel} · ${authorText}` : typeLabel,
				};
			}
			case "series":
				return {
					title: hit.name,
					subtitle: hit.author
						? `${m["nav.series"]()} · ${hit.author.name}`
						: m["nav.series"](),
				};
			case "author":
				return { title: hit.name, subtitle: m["common.author"]() };
			case "collection":
				return {
					title: hit.name,
					subtitle: m["search.collection_by"]({
						username: hit.ownerUsername ?? "",
					}),
				};
			case "user":
				return {
					title: hit.displayUsername ?? hit.name,
					subtitle: `@${hit.username}`,
				};
		}
	};

	const searchInput = (
		<InputGroup
			className={cn(
				"theme-gradient-surface group/search h-11 rounded-xl bg-control",
				showDropdown && "shadow-sm",
			)}
		>
			<InputGroupInput
				ref={inputRef}
				type="search"
				role="combobox"
				aria-expanded={showDropdown}
				aria-controls={LISTBOX_ID}
				aria-activedescendant={activeDescendant}
				aria-autocomplete="list"
				aria-busy={isSearchPending || undefined}
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
				className="h-11 px-0 text-base placeholder:text-muted-foreground md:text-sm [&::-webkit-search-cancel-button]:hidden"
			/>
			<InputGroupAddon align="inline-start" className="ps-3.5">
				<MagnifyingGlass aria-hidden="true" className="size-5" />
			</InputGroupAddon>
			<InputGroupAddon align="inline-end" className="pe-2">
				{query.length > 0 ? (
					<InputGroupButton
						variant="ambient"
						size="icon-xs"
						onClick={handleClear}
						aria-label={m["common.clear_search"]()}
						className="rounded-full text-muted-foreground"
					>
						<X aria-hidden="true" />
					</InputGroupButton>
				) : (
					<kbd className="pointer-events-none hidden items-center gap-0.5 rounded border border-border/60 bg-foreground/10 px-1.5 py-0.5 font-medium font-sans text-muted-foreground text-xs md:group-hover/search:flex">
						{isMac ? "⌘K" : "Ctrl K"}
					</kbd>
				)}
			</InputGroupAddon>
		</InputGroup>
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
						<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
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
									"me-2 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-100 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-safe:transition-[background-color,color,opacity] md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100",
									index === activeIndex && "opacity-100",
								)}
							>
								<X aria-hidden="true" className="size-4" />
							</button>
						</div>
					))}
				</div>
			)}

			{/* MagnifyingGlass results */}
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
									<Skeleton className="size-10 shrink-0 rounded-md" />
									<div className="flex min-w-0 flex-1 flex-col gap-1.5">
										<Skeleton className="h-3.5 w-3/4 rounded" />
										<Skeleton className="h-3 w-2/5 rounded" />
									</div>
								</div>
							))}
						</div>
					)}

					{hasResults && (
						<div className="py-1.5">
							{hits.map((hit, index) => {
								const { title, subtitle } = hitTexts(hit);
								return (
									<button
										key={hitKey(hit)}
										id={`search-option-${index}`}
										role="option"
										aria-selected={index === activeIndex}
										type="button"
										onClick={() => commitHit(hit)}
										onPointerEnter={() => setActiveIndex(index)}
										className={rowClass(index)}
									>
										{hitVisual(hit)}
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-sm">{title}</p>
											<p className="truncate text-muted-foreground text-xs">
												{subtitle}
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
								<ArrowRight
									aria-hidden="true"
									className="size-4 rtl:-scale-x-100"
								/>
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
				<MagnifyingGlass />
			</Button>

			{/* Mobile: expanded search overlay */}
			{mobileExpanded && (
				<div
					ref={containerRef}
					className="theme-gradient-surface fixed inset-x-0 top-0 z-50 flex h-[calc(3.5rem+var(--safe-area-top))] items-center gap-2 bg-sidebar pt-[var(--safe-area-top)] pr-[max(0.75rem,var(--safe-area-right))] pl-[max(0.75rem,var(--safe-area-left))] md:hidden"
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

			{/* Desktop: always visible search bar. Capped and centred on the header's
			    middle grid column — min-w-0 lets it give way to the icon cluster on
			    narrow panels instead of pushing it off. */}
			<div
				ref={mobileExpanded ? undefined : containerRef}
				className="relative hidden min-w-0 md:col-start-2 md:block md:w-[34rem] md:max-w-full"
			>
				{searchInput}
				{dropdown}
			</div>
		</>
	);
}
