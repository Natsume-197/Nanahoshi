import { MatchFlag, PdfErrorCode, TaskStage } from "@embedpdf/models";
import { useSearch } from "@embedpdf/plugin-search/react";
import {
	CaretDown,
	CaretUp,
	CircleNotch,
	MagnifyingGlass,
	X,
} from "@phosphor-icons/react";
import {
	type CSSProperties,
	type KeyboardEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupInput,
} from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePdfNavigation } from "@/features/reader/interaction/use-pdf-navigation";
import type { ReaderTheme } from "@/features/reader/presentation/settings";
import { readerMix } from "@/features/reader/ui/controls/reader-controls";
import { useWindowEvent } from "@/hooks/use-window-event";

interface PdfSearchPanelProps {
	documentId: string;
	theme: ReaderTheme;
	pageCount: number;
	onClose: () => void;
}

const SEARCH_DELAY_MS = 180;
const MAX_RENDERED_RESULTS = 200;

export function PdfSearchPanel({
	documentId,
	theme,
	pageCount,
	onClose,
}: PdfSearchPanelProps) {
	const { state: searchState, provides: search } = useSearch(documentId);
	const { goToPage } = usePdfNavigation(documentId, pageCount);
	const [query, setQuery] = useState("");
	const [matchCase, setMatchCase] = useState(false);
	const [wholeWord, setWholeWord] = useState(false);
	const [scannedPages, setScannedPages] = useState(0);
	const [searchError, setSearchError] = useState<string>();
	const inputRef = useRef<HTMLInputElement | null>(null);
	const activeResultRef = useRef<HTMLButtonElement | null>(null);
	const normalizedQuery = query.trim();
	const activeResult = searchState.results[searchState.activeResultIndex];
	const firstRenderedResult = Math.max(
		0,
		Math.min(
			Math.max(0, searchState.activeResultIndex) - MAX_RENDERED_RESULTS / 2,
			searchState.results.length - MAX_RENDERED_RESULTS,
		),
	);
	const renderedResults = searchState.results.slice(
		firstRenderedResult,
		firstRenderedResult + MAX_RENDERED_RESULTS,
	);

	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	useEffect(() => {
		if (!search) return;
		search.setFlags([
			...(matchCase ? [MatchFlag.MatchCase] : []),
			...(wholeWord ? [MatchFlag.MatchWholeWord] : []),
		]);
		setScannedPages(0);
		setSearchError(undefined);

		if (normalizedQuery.length < 2) {
			search.stopSearch();
			return;
		}

		search.startSearch();
		let task: ReturnType<typeof search.searchAllPages> | undefined;
		const timer = window.setTimeout(() => {
			task = search.searchAllPages(normalizedQuery);
			task.onProgress((progress) => {
				setScannedPages((current) => Math.max(current, progress.page + 1));
			});
			void task.toPromise().catch((error: unknown) => {
				if (task?.state.stage === TaskStage.Aborted) return;
				setSearchError(
					error instanceof Error ? error.message : "Could not search this PDF",
				);
			});
		}, SEARCH_DELAY_MS);

		return () => {
			window.clearTimeout(timer);
			task?.abort({
				code: PdfErrorCode.Cancelled,
				message: "A newer PDF search replaced this one",
			});
		};
	}, [matchCase, normalizedQuery, search, wholeWord]);

	useEffect(() => {
		if (!activeResult || searchState.activeResultIndex < 0) return;
		goToPage(activeResult.pageIndex + 1);
		activeResultRef.current?.scrollIntoView?.({ block: "nearest" });
	}, [activeResult, goToPage, searchState.activeResultIndex]);

	const move = (direction: -1 | 1) => {
		if (direction < 0) search?.previousResult();
		else search?.nextResult();
	};
	const close = () => {
		search?.stopSearch();
		onClose();
	};

	useWindowEvent("keydown", (event) => {
		if (event.key === "Escape") {
			event.preventDefault();
			close();
		} else if (event.key === "F3") {
			event.preventDefault();
			move(event.shiftKey ? -1 : 1);
		}
	});

	const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key !== "Enter") return;
		event.preventDefault();
		move(event.shiftKey ? -1 : 1);
	};
	const mix = (percentage: number) => readerMix(theme, percentage);
	const progress = pageCount > 0 ? scannedPages / pageCount : 0;
	const optionValues = [
		...(matchCase ? ["case"] : []),
		...(wholeWord ? ["word"] : []),
	];

	return (
		<aside
			aria-label="Search PDF"
			className="writing-horizontal-tb fixed top-[max(0.5rem,var(--safe-area-top))] right-[max(0.5rem,var(--safe-area-right))] left-2 z-30 flex max-h-[min(38rem,calc(100dvh-1rem-var(--safe-area-top)))] flex-col overflow-hidden rounded-3xl shadow-2xl sm:left-auto sm:w-[23rem]"
			style={
				{
					color: theme.fontColor,
					backgroundColor: theme.backgroundColor,
					border: `1px solid ${mix(15)}`,
					"--pdf-search-hover": mix(8),
					"--pdf-search-active": mix(14),
				} as CSSProperties
			}
		>
			<header className="flex items-center gap-2 px-3 pt-3 pb-2">
				<MagnifyingGlass
					aria-hidden="true"
					className="size-5 shrink-0 opacity-55"
				/>
				<h2 className="min-w-0 flex-1 font-medium text-sm">Search this PDF</h2>
				<Button
					variant="ghost"
					size="icon-lg"
					aria-label="Close PDF search"
					onClick={close}
				>
					<X aria-hidden="true" />
				</Button>
			</header>

			<div className="px-3 pb-3">
				<label className="sr-only" htmlFor="pdf-search-input">
					Text to find in this PDF
				</label>
				<InputGroup style={{ borderColor: mix(18), backgroundColor: mix(5) }}>
					<InputGroupInput
						ref={inputRef}
						id="pdf-search-input"
						type="search"
						value={query}
						placeholder="Find words or phrases"
						onChange={(event) => setQuery(event.target.value)}
						onKeyDown={handleInputKeyDown}
					/>
					{searchState.loading && (
						<InputGroupAddon align="inline-end">
							<CircleNotch
								aria-label="Searching"
								className="animate-spin motion-reduce:animate-none"
							/>
						</InputGroupAddon>
					)}
				</InputGroup>

				<ToggleGroup
					multiple
					variant="outline"
					size="sm"
					value={optionValues}
					className="mt-2"
					onValueChange={(values) => {
						setMatchCase(values.includes("case"));
						setWholeWord(values.includes("word"));
					}}
				>
					<ToggleGroupItem value="case" aria-label="Match case">
						Aa
					</ToggleGroupItem>
					<ToggleGroupItem value="word" aria-label="Match whole words">
						Whole word
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			<div className="h-px shrink-0" style={{ backgroundColor: mix(12) }}>
				<div
					className="h-full origin-left bg-current transition-[width] duration-150 motion-reduce:transition-none"
					style={{
						width: searchState.loading
							? `${Math.max(3, progress * 100)}%`
							: "0%",
					}}
				/>
			</div>

			<div className="flex min-h-11 shrink-0 items-center gap-2 px-3 text-xs">
				<p
					className="min-w-0 flex-1 truncate opacity-60"
					role="status"
					aria-label="PDF search status"
					aria-live={searchState.loading ? "off" : "polite"}
				>
					{searchStatus({
						queryLength: normalizedQuery.length,
						searching: searchState.loading,
						matches: searchState.results.length,
						scannedPages,
						totalPages: pageCount,
						error: searchError,
					})}
				</p>
				{searchState.results.length > 0 && (
					<>
						<span className="tabular-nums opacity-70">
							{searchState.activeResultIndex + 1} / {searchState.results.length}
						</span>
						<Button
							variant="ghost"
							size="icon-lg"
							aria-label="Previous search result"
							onClick={() => move(-1)}
						>
							<CaretUp aria-hidden="true" />
						</Button>
						<Button
							variant="ghost"
							size="icon-lg"
							aria-label="Next search result"
							onClick={() => move(1)}
						>
							<CaretDown aria-hidden="true" />
						</Button>
					</>
				)}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
				{renderedResults.map((result, renderedIndex) => {
					const index = firstRenderedResult + renderedIndex;
					const active = index === searchState.activeResultIndex;
					return (
						<Button
							key={`${result.pageIndex}-${result.charIndex}-${result.charCount}`}
							ref={active ? activeResultRef : undefined}
							variant="ghost"
							aria-current={active ? "true" : undefined}
							className="mb-1 h-auto w-full items-start whitespace-normal px-3 py-2.5 text-left"
							onClick={() => search?.goToResult(index)}
						>
							<span className="min-w-0">
								<span className="mb-1 block font-medium text-[0.6875rem] uppercase tracking-wide opacity-45">
									Page {result.pageIndex + 1}
									<span className="sr-only">, result {index + 1}</span>
								</span>
								<span className="line-clamp-3 text-sm leading-relaxed opacity-80">
									{result.context.truncatedLeft ? "…" : ""}
									{result.context.before}{" "}
									<mark
										className="rounded-sm px-0.5 font-semibold"
										style={{
											color: theme.backgroundColor,
											backgroundColor: theme.fontColor,
										}}
									>
										{result.context.match}
									</mark>{" "}
									{result.context.after}
									{result.context.truncatedRight ? "…" : ""}
								</span>
							</span>
						</Button>
					);
				})}
			</div>
		</aside>
	);
}

function searchStatus({
	queryLength,
	searching,
	matches,
	scannedPages,
	totalPages,
	error,
}: {
	queryLength: number;
	searching: boolean;
	matches: number;
	scannedPages: number;
	totalPages: number;
	error?: string;
}) {
	if (error) return error;
	if (queryLength < 2) return "Type at least 2 characters";
	if (searching) {
		return matches > 0
			? `${matches} found · page ${scannedPages} of ${totalPages}`
			: `Searching page ${Math.max(1, scannedPages)} of ${totalPages}`;
	}
	if (matches === 0) return "No matches in this PDF";
	return `${matches} matches`;
}
