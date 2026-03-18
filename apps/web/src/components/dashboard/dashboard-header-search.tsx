import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, Search } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/use-debounce";
import {
	coverPresets,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const MAX_DROPDOWN_RESULTS = 6;
const HEADER_SEARCH_MIN_QUERY_LENGTH = 1;
const HEADER_SEARCH_DEBOUNCE_MS = 300;
const LISTBOX_ID = "search-listbox";

export function DashboardHeaderSearch() {
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);
	const normalizedQuery = query.trim();
	const debouncedQuery = useDebounce(
		normalizedQuery,
		HEADER_SEARCH_DEBOUNCE_MS,
	);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const inputRef = useRef<HTMLInputElement | null>(null);
	const shouldSearch =
		open && debouncedQuery.length >= HEADER_SEARCH_MIN_QUERY_LENGTH;

	const { data: searchResult, isFetching } = useQuery({
		...orpc.books.search.queryOptions({
			input: { query: debouncedQuery, limit: MAX_DROPDOWN_RESULTS + 1 },
		}),
		enabled: shouldSearch,
		staleTime: 60_000,
	});

	const books = searchResult?.books;
	const showDropdown = open && normalizedQuery.length > 0;

	const displayedBooks = useMemo(
		() => books?.slice(0, MAX_DROPDOWN_RESULTS),
		[books],
	);

	// Include "See all results" as the last option when there are results
	const hasResults = !isFetching && displayedBooks && displayedBooks.length > 0;
	const totalOptions = hasResults ? displayedBooks.length + 1 : 0;

	const prevDebouncedQueryRef = useRef(debouncedQuery);
	if (debouncedQuery !== prevDebouncedQueryRef.current) {
		prevDebouncedQueryRef.current = debouncedQuery;
		setActiveIndex(-1);
	}

	const openRef = useRef(open);
	openRef.current = open;

	useMountEffect(() => {
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
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	});

	const handleSeeAll = useCallback(() => {
		if (!normalizedQuery) return;
		setOpen(false);
		setQuery("");
		setActiveIndex(-1);
		navigate({ to: "/dashboard/search", search: { q: normalizedQuery } });
	}, [navigate, normalizedQuery]);

	const handleBookClick = useCallback(
		(uuid: string) => {
			setOpen(false);
			setQuery("");
			setActiveIndex(-1);
			navigate({ to: "/dashboard/books/$uuid", params: { uuid } });
		},
		[navigate],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (!showDropdown || totalOptions === 0) {
				if (
					e.key === "Enter" &&
					normalizedQuery.length >= HEADER_SEARCH_MIN_QUERY_LENGTH
				) {
					handleSeeAll();
				}
				if (e.key === "Escape") {
					setOpen(false);
					setActiveIndex(-1);
					inputRef.current?.blur();
				}
				return;
			}

			switch (e.key) {
				case "ArrowDown": {
					e.preventDefault();
					setActiveIndex((prev) => (prev < totalOptions - 1 ? prev + 1 : 0));
					break;
				}
				case "ArrowUp": {
					e.preventDefault();
					setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalOptions - 1));
					break;
				}
				case "Enter": {
					e.preventDefault();
					if (activeIndex >= 0 && displayedBooks) {
						if (activeIndex < displayedBooks.length) {
							handleBookClick(displayedBooks[activeIndex].uuid);
						} else {
							handleSeeAll();
						}
					} else if (normalizedQuery.length >= HEADER_SEARCH_MIN_QUERY_LENGTH) {
						handleSeeAll();
					}
					break;
				}
				case "Escape": {
					setOpen(false);
					setActiveIndex(-1);
					inputRef.current?.blur();
					break;
				}
			}
		},
		[
			showDropdown,
			totalOptions,
			activeIndex,
			displayedBooks,
			normalizedQuery,
			handleSeeAll,
			handleBookClick,
		],
	);

	const activeDescendant =
		activeIndex >= 0
			? activeIndex < (displayedBooks?.length ?? 0)
				? `search-option-${activeIndex}`
				: "search-option-see-all"
			: undefined;

	return (
		<div ref={containerRef} className="relative mx-auto w-full max-w-md">
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
					placeholder="What do you want to read?"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setOpen(true);
						setActiveIndex(-1);
					}}
					onFocus={() => setOpen(true)}
					onKeyDown={handleKeyDown}
					autoComplete="off"
					className="h-9 rounded-full border-border/50 bg-muted/40 pl-9 text-sm placeholder:text-muted-foreground/60 focus-visible:border-primary/30 focus-visible:bg-muted/60 focus-visible:ring-primary/20"
				/>
			</div>

			{showDropdown && (
				<div
					id={LISTBOX_ID}
					role="listbox"
					aria-label="Search results"
					className="absolute top-[calc(100%+6px)] right-0 left-0 z-50 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-black/20 shadow-xl"
				>
					{normalizedQuery.length < HEADER_SEARCH_MIN_QUERY_LENGTH && (
						<div className="px-4 py-3 text-muted-foreground text-sm">
							Type at least {HEADER_SEARCH_MIN_QUERY_LENGTH} character
							{HEADER_SEARCH_MIN_QUERY_LENGTH === 1 ? "" : "s"} to search.
						</div>
					)}

					{isFetching && shouldSearch && (
						<div
							className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-sm"
							aria-live="polite"
						>
							<Loader2 className="size-4 animate-spin" />
							Searching...
						</div>
					)}

					{hasResults && (
						<div className="py-1.5">
							{displayedBooks.map((book, index) => {
								const coverFilename = book.cover?.split("/").pop();
								const displayTitle = book.title ?? book.filename;
								const authorText = book.authors?.map((a) => a.name).join(", ");

								return (
									<button
										key={book.uuid}
										id={`search-option-${index}`}
										role="option"
										aria-selected={index === activeIndex}
										type="button"
										onClick={() => handleBookClick(book.uuid)}
										onPointerEnter={() => setActiveIndex(index)}
										className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors ${index === activeIndex ? "bg-muted/60" : "hover:bg-muted/60"}`}
									>
										<div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted">
											{coverFilename ? (
												<img
													src={getCoverPresetUrl(
														coverFilename,
														coverPresets.thumbnail,
													)}
													srcSet={getCoverSrcSet(
														coverFilename,
														coverPresets.thumbnail.widths,
													)}
													sizes={coverPresets.thumbnail.sizes}
													alt=""
													className="h-full w-full object-cover"
													loading="lazy"
													decoding="async"
													width={80}
													height={120}
												/>
											) : (
												<div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
													No cover
												</div>
											)}
										</div>
										<div className="min-w-0 flex-1">
											<p className="truncate font-medium text-sm">
												{displayTitle}
											</p>
											{authorText && (
												<p className="truncate text-muted-foreground text-xs">
													{authorText}
												</p>
											)}
										</div>
									</button>
								);
							})}
						</div>
					)}

					{!isFetching && shouldSearch && books && books.length === 0 && (
						<div
							className="px-4 py-3 text-muted-foreground text-sm"
							aria-live="polite"
						>
							No results for &ldquo;{debouncedQuery}&rdquo;
						</div>
					)}

					{hasResults && (
						<div className="border-border/40 border-t">
							<button
								id="search-option-see-all"
								role="option"
								aria-selected={activeIndex === displayedBooks.length}
								type="button"
								onClick={handleSeeAll}
								onPointerEnter={() => setActiveIndex(displayedBooks.length)}
								className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-primary text-sm transition-colors ${activeIndex === displayedBooks.length ? "bg-muted/40" : "hover:bg-muted/40"}`}
							>
								<span>See all results</span>
								<ArrowRight className="size-4" />
							</button>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
