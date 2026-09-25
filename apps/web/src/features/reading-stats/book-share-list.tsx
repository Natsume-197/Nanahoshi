import { BookOpen, Headphones } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { readingDuration } from "@/features/reading-sessions/reading-duration";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import {
	coverPresets,
	getCoverFilename,
	getCoverPresetUrl,
	getCoverSrcSet,
} from "@/utils/covers";
import { TONE_BG } from "./goal-gauge";
import type { BookShare } from "./stats-model";

export interface StatsBook {
	uuid: string | null;
	title: string | null;
	cover: string | null;
	mainColor: string | null;
	mediaType: "ebook" | "audiobook" | null;
}

const VISIBLE = 5;

function Cover({ book }: { book: StatsBook }) {
	const filename = getCoverFilename(book.cover);
	const Icon = book.mediaType === "audiobook" ? Headphones : BookOpen;
	return (
		<span
			className={cn(
				"grid w-10 shrink-0 place-items-center overflow-hidden rounded bg-muted",
				book.mediaType === "audiobook" ? "aspect-square" : "aspect-[2/3]",
			)}
			style={{ backgroundColor: book.mainColor ?? undefined }}
		>
			{filename ? (
				<img
					src={getCoverPresetUrl(filename, coverPresets.thumbnail)}
					srcSet={getCoverSrcSet(filename, coverPresets.thumbnail.widths)}
					sizes="40px"
					alt=""
					loading="lazy"
					className="size-full object-cover"
				/>
			) : (
				<Icon aria-hidden="true" className="size-4 text-muted-foreground" />
			)}
		</span>
	);
}

export function BookShareList({
	shares,
	books,
}: {
	shares: BookShare[];
	books: StatsBook[];
}) {
	const [expanded, setExpanded] = useState(false);
	const percent = new Intl.NumberFormat(getLocale(), {
		style: "percent",
		maximumFractionDigits: 0,
	});
	const chars = new Intl.NumberFormat(getLocale(), {
		notation: "compact",
		maximumFractionDigits: 1,
	});
	const shown = expanded ? shares : shares.slice(0, VISIBLE);
	if (shares.length === 0)
		return (
			<p className="px-1 py-6 text-center text-muted-foreground text-sm">
				{m.stats_books_empty()}
			</p>
		);
	return (
		<div className="space-y-1">
			<ol className="space-y-1">
				{shown.map((share) => {
					const book = books[share.book];
					if (!book) return null;
					const title = book.title ?? m.stats_book_unavailable();
					const content = (
						<>
							<Cover book={book} />
							<span className="min-w-0 flex-1 space-y-1.5">
								<span className="flex items-baseline justify-between gap-3">
									<span
										className={cn(
											"truncate font-medium text-sm",
											!book.title && "text-muted-foreground",
										)}
									>
										{title}
									</span>
									<span className="shrink-0 text-muted-foreground text-xs tabular-nums">
										{percent.format(share.fraction)}
									</span>
								</span>
								<span
									aria-hidden="true"
									className="flex h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]"
								>
									<span
										className={cn(
											"h-full rounded-full",
											TONE_BG[
												share.media.includes("reading")
													? "reading"
													: "listening"
											],
										)}
										style={{ width: `${Math.max(2, share.fraction * 100)}%` }}
									/>
								</span>
								<span className="flex gap-2 text-muted-foreground text-xs tabular-nums">
									<span>{readingDuration(share.seconds)}</span>
									{share.characters > 0 && (
										<span>
											·{" "}
											{m.stats_characters_short({
												value: chars.format(share.characters),
											})}
										</span>
									)}
									{share.media.length > 1 && (
										<span>· {m.stats_read_and_listen()}</span>
									)}
								</span>
							</span>
						</>
					);
					const rowClass =
						"flex items-center gap-3 rounded-xl px-2 py-2 transition-colors";
					return (
						<li key={share.book}>
							{book.uuid ? (
								<Link
									to={
										book.mediaType === "audiobook"
											? "/dashboard/audiobooks/$uuid"
											: "/dashboard/books/$uuid"
									}
									params={{ uuid: book.uuid }}
									className={cn(
										rowClass,
										"hover:bg-foreground/[0.04] focus-visible:outline-2 focus-visible:outline-ring",
									)}
								>
									{content}
								</Link>
							) : (
								<div className={rowClass}>{content}</div>
							)}
						</li>
					);
				})}
			</ol>
			{shares.length > VISIBLE && (
				<button
					type="button"
					onClick={() => setExpanded(!expanded)}
					className="min-h-10 w-full rounded-xl text-muted-foreground text-sm hover:bg-foreground/[0.04] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
				>
					{expanded
						? m.stats_books_less()
						: m.stats_books_more({ count: shares.length - VISIBLE })}
				</button>
			)}
		</div>
	);
}
