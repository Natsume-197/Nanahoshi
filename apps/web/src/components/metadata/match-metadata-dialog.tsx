import {
	ArrowSquareOut,
	BookOpen,
	CircleNotch,
	Headphones,
	MagnifyingGlass,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { formatReadingTime, getErrorMessage } from "@/utils/format";
import { client } from "@/utils/orpc";

// Fix match: search an external source for the correct entry and replace this
// item's metadata with it. Locked (hand-edited) fields survive server-side.

type MatchCandidate = {
	provider: string;
	providerId: string;
	title: string;
	subtitle?: string | null;
	/** Pre-formatted secondary rows (authors, series · year …). */
	metaLines: string[];
	previewCover?: string | null;
	/** Provider page — cover and title link out to it when present. */
	url?: string | null;
};

type ProviderOption = {
	id: string;
	label: string;
	/** Shows the optional ASIN field when this source is selected. */
	supportsAsin?: boolean;
};

function CandidateRow({
	candidate,
	coverClass,
	fallbackIcon,
	applying,
	disabled,
	onApply,
}: {
	candidate: MatchCandidate;
	coverClass: string;
	fallbackIcon: ReactNode;
	applying: boolean;
	disabled: boolean;
	onApply: () => void;
}) {
	const cover = candidate.previewCover ? (
		<img
			src={candidate.previewCover}
			alt=""
			className={cn("shrink-0 rounded object-cover", coverClass)}
			loading="lazy"
		/>
	) : (
		<div
			className={cn(
				"flex shrink-0 items-center justify-center rounded bg-muted",
				coverClass,
			)}
		>
			{fallbackIcon}
		</div>
	);

	const title = (
		<p className="line-clamp-2 font-medium text-sm leading-snug">
			{candidate.title}
			{candidate.url && (
				<ArrowSquareOut className="ml-1 inline size-3 align-baseline text-muted-foreground/60" />
			)}
		</p>
	);

	return (
		<li className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:bg-accent/40">
			{candidate.url ? (
				<a
					href={candidate.url}
					target="_blank"
					rel="noopener noreferrer"
					className="shrink-0 transition-opacity hover:opacity-80"
					aria-label={m["aria.open_provider_page"]()}
				>
					{cover}
				</a>
			) : (
				cover
			)}
			<div className="min-w-0 flex-1 space-y-0.5">
				{candidate.url ? (
					<a
						href={candidate.url}
						target="_blank"
						rel="noopener noreferrer"
						className="decoration-muted-foreground/40 underline-offset-2 hover:underline"
					>
						{title}
					</a>
				) : (
					title
				)}
				{candidate.subtitle && (
					<p className="truncate text-muted-foreground text-xs">
						{candidate.subtitle}
					</p>
				)}
				{candidate.metaLines.map((line) => (
					<p key={line} className="truncate text-muted-foreground text-xs">
						{line}
					</p>
				))}
			</div>
			<Button
				type="button"
				size="sm"
				variant="outline"
				className="shrink-0"
				disabled={disabled}
				onClick={onApply}
			>
				{applying && <CircleNotch className="size-3.5 animate-spin" />}
				{m["match.use_this"]()}
			</Button>
		</li>
	);
}

function ResultsPlaceholder({ icon, text }: { icon: ReactNode; text: string }) {
	return (
		<div className="flex flex-col items-center gap-2 py-10 text-center">
			{icon}
			<p className="max-w-xs text-muted-foreground text-sm">{text}</p>
		</div>
	);
}

function FixMatchDialog({
	open,
	onOpenChange,
	providers,
	initialTitle,
	initialAuthor,
	initialAsin,
	coverClass,
	fallbackIcon,
	search,
	apply,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	providers: ProviderOption[];
	initialTitle: string;
	initialAuthor?: string;
	initialAsin?: string | null;
	coverClass: string;
	fallbackIcon: ReactNode;
	search: (params: {
		provider: string;
		title?: string;
		author?: string;
		asin?: string;
	}) => Promise<MatchCandidate[]>;
	apply: (candidate: MatchCandidate) => Promise<boolean>;
}) {
	const router = useRouter();
	const [provider, setProvider] = useState(providers[0]?.id ?? "");
	const [title, setTitle] = useState(initialTitle);
	const [author, setAuthor] = useState(initialAuthor ?? "");
	const [asin, setAsin] = useState(initialAsin ?? "");
	const [results, setResults] = useState<MatchCandidate[] | null>(null);

	const providerOption = providers.find((p) => p.id === provider);
	const showAsin = providerOption?.supportsAsin ?? false;
	const canSearch = title.trim() !== "" || (showAsin && asin.trim() !== "");

	const searchMutation = useMutation({
		mutationFn: () =>
			search({
				provider,
				title: title.trim() || undefined,
				author: author.trim() || undefined,
				asin: showAsin ? asin.trim() || undefined : undefined,
			}),
		onSuccess: (candidates) => setResults(candidates),
		onError: (error) => {
			toast.error(getErrorMessage(error, m["match.failed"]()));
		},
	});

	const applyMutation = useMutation({
		mutationFn: (candidate: MatchCandidate) => apply(candidate),
		onSuccess: async (applied) => {
			if (applied) {
				toast.success(m["match.applied"]());
				await router.invalidate();
				onOpenChange(false);
			} else {
				toast.info(m["match.no_data"]());
			}
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, m["match.apply_failed"]()));
		},
	});

	const busy = searchMutation.isPending || applyMutation.isPending;

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={m["match.dialog_title"]()}
			description={m["match.dialog_description"]()}
			className="sm:max-w-xl"
			onSubmit={(e) => {
				e.preventDefault();
				if (canSearch && !busy) searchMutation.mutate();
			}}
		>
			<div className="space-y-4">
				{providers.length > 1 && (
					<div className="space-y-1.5">
						<Label className="text-muted-foreground text-xs">
							{m["match.source"]()}
						</Label>
						<Tabs
							value={provider}
							onValueChange={(v) => setProvider(String(v))}
						>
							<TabsList>
								{providers.map((p) => (
									<TabsTrigger key={p.id} value={p.id} className="px-4">
										{p.label}
									</TabsTrigger>
								))}
							</TabsList>
						</Tabs>
					</div>
				)}

				<div className="flex flex-col gap-3 sm:flex-row">
					<div className="flex-1 space-y-1.5">
						<Label
							htmlFor="fix-match-title"
							className="text-muted-foreground text-xs"
						>
							{m["match.field_title"]()}
						</Label>
						<Input
							id="fix-match-title"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							autoFocus
						/>
					</div>
					<div className="space-y-1.5 sm:w-44">
						<Label
							htmlFor="fix-match-author"
							className="text-muted-foreground text-xs"
						>
							{m["match.field_author"]()}{" "}
							<span className="opacity-60">({m["match.optional"]()})</span>
						</Label>
						<Input
							id="fix-match-author"
							value={author}
							onChange={(e) => setAuthor(e.target.value)}
						/>
					</div>
				</div>

				<div className="flex items-end gap-3">
					{showAsin ? (
						<div className="space-y-1.5">
							<Label
								htmlFor="fix-match-asin"
								className="text-muted-foreground text-xs"
							>
								{m["match.field_asin"]()}{" "}
								<span className="opacity-60">({m["match.optional"]()})</span>
							</Label>
							<Input
								id="fix-match-asin"
								value={asin}
								onChange={(e) => setAsin(e.target.value)}
								className="font-mono sm:w-44"
								title={m["match.asin_hint"]()}
							/>
						</div>
					) : (
						<div className="flex-1" />
					)}
					<Button
						type="submit"
						disabled={busy || !canSearch}
						className={cn(showAsin && "ml-auto")}
					>
						{searchMutation.isPending ? (
							<CircleNotch className="size-4 animate-spin" />
						) : (
							<MagnifyingGlass className="size-4" />
						)}
						{m["match.search"]()}
					</Button>
				</div>

				<div className="rounded-lg border border-border/60 bg-muted/20">
					{searchMutation.isPending ? (
						<ul className="space-y-2 p-3">
							{[0, 1, 2].map((i) => (
								<li key={i} className="flex items-center gap-3 p-1">
									<Skeleton className={cn("shrink-0 rounded", coverClass)} />
									<div className="flex-1 space-y-2">
										<Skeleton className="h-4 w-3/4" />
										<Skeleton className="h-3 w-1/2" />
									</div>
								</li>
							))}
						</ul>
					) : results === null ? (
						<ResultsPlaceholder
							icon={
								<MagnifyingGlass className="size-6 text-muted-foreground/40" />
							}
							text={m["match.initial_hint"]()}
						/>
					) : results.length === 0 ? (
						<ResultsPlaceholder
							icon={
								<MagnifyingGlass className="size-6 text-muted-foreground/40" />
							}
							text={m["match.no_results"]()}
						/>
					) : (
						<ul className="max-h-[45vh] space-y-2 overflow-y-auto p-3">
							{results.map((candidate) => (
								<CandidateRow
									key={`${candidate.provider}-${candidate.providerId}`}
									candidate={candidate}
									coverClass={coverClass}
									fallbackIcon={fallbackIcon}
									applying={
										applyMutation.isPending &&
										applyMutation.variables?.providerId === candidate.providerId
									}
									disabled={busy}
									onApply={() => applyMutation.mutate(candidate)}
								/>
							))}
						</ul>
					)}
				</div>
			</div>
		</Modal>
	);
}

// ─── Books ────────────────────────────────────────────────

type BookCandidate = Awaited<
	ReturnType<typeof client.books.searchMetadata>
>[number];

function bookMeta(candidate: BookCandidate): string[] {
	const lines: string[] = [];
	const authors = candidate.authors?.map((a) => a.name).join(", ");
	if (authors) lines.push(authors);
	const seriesLine = [
		candidate.series?.name
			? `${candidate.series.name}${
					candidate.series.position != null
						? ` #${candidate.series.position}`
						: ""
				}`
			: null,
		candidate.publishedDate?.slice(0, 4),
	]
		.filter(Boolean)
		.join(" · ");
	if (seriesLine) lines.push(seriesLine);
	return lines;
}

export function BookMatchDialog({
	open,
	onOpenChange,
	bookUuid,
	initialTitle,
	initialAuthor,
	initialAsin,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	bookUuid: string;
	initialTitle: string;
	initialAuthor?: string;
	initialAsin?: string | null;
}) {
	return (
		<FixMatchDialog
			open={open}
			onOpenChange={onOpenChange}
			providers={[
				{ id: "ranobedb", label: "RanobeDB" },
				{ id: "amazon", label: "Amazon", supportsAsin: true },
			]}
			initialTitle={initialTitle}
			initialAuthor={initialAuthor}
			initialAsin={initialAsin}
			coverClass="h-16 w-11"
			fallbackIcon={<BookOpen className="size-5 text-muted-foreground/40" />}
			search={async ({ provider, title, author, asin }) => {
				const candidates = await client.books.searchMetadata({
					uuid: bookUuid,
					provider: provider as "ranobedb" | "amazon",
					title,
					author,
					asin,
				});
				return candidates.map((c) => ({
					provider: c.provider,
					providerId: c.providerId,
					title: c.title,
					subtitle: c.titleRomaji,
					metaLines: bookMeta(c),
					previewCover: c.previewCover,
					url: c.url,
				}));
			}}
			apply={async (candidate) => {
				const result = await client.books.applyMetadata({
					uuid: bookUuid,
					provider: candidate.provider as "ranobedb" | "amazon",
					providerId: candidate.providerId,
				});
				return result.success;
			}}
		/>
	);
}

// ─── Audiobooks ───────────────────────────────────────────

type AudiobookCandidate = Awaited<
	ReturnType<typeof client.audiobooks.searchMetadata>
>[number];

function audiobookMeta(candidate: AudiobookCandidate): string[] {
	const lines: string[] = [];
	const people = [
		candidate.authors?.map((a) => a.name).join(", "),
		candidate.narrators?.map((n) => n.name).join(", "),
	]
		.filter(Boolean)
		.join(" · ");
	if (people) lines.push(people);
	const detail = [
		candidate.series?.name
			? `${candidate.series.name}${
					candidate.series.position != null
						? ` #${candidate.series.position}`
						: ""
				}`
			: null,
		candidate.duration ? formatReadingTime(candidate.duration) : null,
		candidate.publishedDate?.slice(0, 4),
	]
		.filter(Boolean)
		.join(" · ");
	if (detail) lines.push(detail);
	return lines;
}

export function AudiobookMatchDialog({
	open,
	onOpenChange,
	audiobookUuid,
	initialTitle,
	initialAuthor,
	initialAsin,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	audiobookUuid: string;
	initialTitle: string;
	initialAuthor?: string;
	initialAsin?: string | null;
}) {
	return (
		<FixMatchDialog
			open={open}
			onOpenChange={onOpenChange}
			providers={[
				{ id: "audible", label: "Audible", supportsAsin: true },
				{ id: "itunes", label: "Apple iTunes" },
			]}
			initialTitle={initialTitle}
			initialAuthor={initialAuthor}
			initialAsin={initialAsin}
			coverClass="size-14"
			fallbackIcon={<Headphones className="size-5 text-muted-foreground/40" />}
			search={async ({ provider, title, author, asin }) => {
				const candidates = await client.audiobooks.searchMetadata({
					uuid: audiobookUuid,
					provider: provider as "audible" | "itunes",
					title,
					author,
					asin,
				});
				return candidates.map((c) => ({
					provider: c.provider,
					providerId: c.providerId,
					title: c.title ?? "",
					metaLines: audiobookMeta(c),
					previewCover: c.previewCover,
					url: c.url,
				}));
			}}
			apply={async (candidate) => {
				const result = await client.audiobooks.applyMetadata({
					uuid: audiobookUuid,
					provider: candidate.provider as "audible" | "itunes",
					providerId: candidate.providerId,
				});
				return result !== null;
			}}
		/>
	);
}
