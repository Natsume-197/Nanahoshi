import {
	CircleNotch,
	Headphones,
	MagnifyingGlass,
} from "@phosphor-icons/react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { m } from "@/paraglide/messages";
import { formatReadingTime, getErrorMessage } from "@/utils/format";
import { client } from "@/utils/orpc";

type ProviderId = "audible" | "itunes";

const PROVIDER_LABELS: Record<ProviderId, string> = {
	audible: "Audible",
	itunes: "Apple iTunes",
};

type Candidate = Awaited<
	ReturnType<typeof client.audiobooks.searchMetadata>
>[number];

export function MatchMetadataDialog({
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
	const router = useRouter();
	const [query, setQuery] = useState(initialTitle);
	const [author, setAuthor] = useState(initialAuthor ?? "");
	const [asin, setAsin] = useState(initialAsin ?? "");
	const [provider, setProvider] = useState<ProviderId>("audible");
	const [results, setResults] = useState<Candidate[] | null>(null);

	const searchMutation = useMutation({
		mutationFn: () =>
			client.audiobooks.searchMetadata({
				uuid: audiobookUuid,
				title: query.trim() || undefined,
				author: author.trim() || undefined,
				asin: asin.trim() || undefined,
				provider,
			}),
		onSuccess: (candidates) => setResults(candidates),
		onError: (error) => {
			toast.error(getErrorMessage(error, m["audiobook.match_failed"]()));
		},
	});

	const applyMutation = useMutation({
		mutationFn: (candidate: Candidate) =>
			client.audiobooks.applyMetadata({
				uuid: audiobookUuid,
				provider: candidate.provider,
				providerId: candidate.providerId,
			}),
		onSuccess: async (result) => {
			if (result) {
				toast.success(m["audiobook.match_applied"]());
				await router.invalidate();
				onOpenChange(false);
			} else {
				toast.info(m["audiobook.match_no_data"]());
			}
		},
		onError: (error) => {
			toast.error(getErrorMessage(error, m["audiobook.match_failed"]()));
		},
	});

	const busy = searchMutation.isPending || applyMutation.isPending;

	return (
		<Modal
			open={open}
			onOpenChange={onOpenChange}
			title={m["audiobook.match_metadata"]()}
			description={m["audiobook.match_description"]()}
			className="sm:max-w-xl"
			onSubmit={(e) => {
				e.preventDefault();
				if (query.trim() || asin.trim()) searchMutation.mutate();
			}}
		>
			<div className="space-y-4">
				<div className="space-y-2">
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder={m["audiobook.match_search_placeholder"]()}
							aria-label={m["audiobook.match_search_placeholder"]()}
							autoFocus
						/>
						<Input
							value={author}
							onChange={(e) => setAuthor(e.target.value)}
							placeholder={m["audiobook.match_author_placeholder"]()}
							aria-label={m["audiobook.match_author_placeholder"]()}
							className="sm:max-w-40"
						/>
					</div>
					<div className="flex flex-col gap-2 sm:flex-row">
						<Input
							value={asin}
							onChange={(e) => setAsin(e.target.value)}
							placeholder={m["audiobook.match_asin_placeholder"]()}
							aria-label={m["audiobook.match_asin_placeholder"]()}
							className="font-mono sm:max-w-48"
						/>
						<Select
							value={provider}
							onValueChange={(v) => setProvider(v as ProviderId)}
						>
							<SelectTrigger
								className="sm:w-36"
								aria-label={m["audiobook.match_provider"]()}
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{(Object.keys(PROVIDER_LABELS) as ProviderId[]).map((id) => (
									<SelectItem key={id} value={id}>
										{PROVIDER_LABELS[id]}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
						<Button
							type="submit"
							disabled={busy || (!query.trim() && !asin.trim())}
						>
							{searchMutation.isPending ? (
								<CircleNotch className="size-4 animate-spin" />
							) : (
								<MagnifyingGlass className="size-4" />
							)}
							{m["audiobook.match_search"]()}
						</Button>
					</div>
					<p className="text-muted-foreground text-xs">
						{m["audiobook.match_asin_hint"]()}
					</p>
				</div>

				{results && results.length === 0 && (
					<p className="py-6 text-center text-muted-foreground text-sm">
						{m["audiobook.match_no_results"]()}
					</p>
				)}

				{results && results.length > 0 && (
					<ul className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
						{results.map((candidate) => (
							<li
								key={`${candidate.provider}-${candidate.providerId}`}
								className="flex items-center gap-3 rounded-md border border-border p-2.5"
							>
								{candidate.previewCover ? (
									<img
										src={candidate.previewCover}
										alt=""
										className="size-14 shrink-0 rounded object-cover"
										loading="lazy"
									/>
								) : (
									<div className="flex size-14 shrink-0 items-center justify-center rounded bg-muted">
										<Headphones className="size-5 text-muted-foreground/40" />
									</div>
								)}
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-sm">
										{candidate.title}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{[
											candidate.authors?.map((a) => a.name).join(", "),
											candidate.narrators?.map((n) => n.name).join(", "),
										]
											.filter(Boolean)
											.join(" · ")}
									</p>
									<p className="truncate text-muted-foreground text-xs">
										{[
											candidate.series?.name
												? `${candidate.series.name}${
														candidate.series.position != null
															? ` #${candidate.series.position}`
															: ""
													}`
												: null,
											candidate.duration
												? formatReadingTime(candidate.duration)
												: null,
											candidate.publishedDate?.slice(0, 4),
										]
											.filter(Boolean)
											.join(" · ")}
									</p>
								</div>
								<Button
									type="button"
									size="sm"
									variant="outline"
									disabled={busy}
									onClick={() => applyMutation.mutate(candidate)}
								>
									{applyMutation.isPending &&
									applyMutation.variables?.providerId ===
										candidate.providerId ? (
										<CircleNotch className="size-3.5 animate-spin" />
									) : null}
									{m["audiobook.match_apply"]()}
								</Button>
							</li>
						))}
					</ul>
				)}
			</div>
		</Modal>
	);
}
