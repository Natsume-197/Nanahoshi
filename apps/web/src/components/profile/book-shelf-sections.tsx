import { BookOpen, Headphones } from "@phosphor-icons/react";
import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import {
	DASHBOARD_BOOK_TILE_CLASS,
	SectionSkeleton,
} from "@/components/dashboard/home/section-skeleton";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Badge } from "@/components/ui/badge";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

const BOOK_GRID_ITEM_LIMIT = 10;
const AUDIOBOOK_GRID_ITEM_LIMIT = 8;

export type ShelfStatus = "want_to_read" | "backlog" | "reading" | "completed";
export type AudiobookShelfStatus =
	| "want_to_listen"
	| "backlog"
	| "listening"
	| "completed";

type ShelfSection<TStatus extends string> = {
	status: TStatus;
	label: string;
};

const SHELF_SECTIONS: Array<ShelfSection<ShelfStatus>> = [
	{ status: "completed", label: "Completed" },
	{ status: "reading", label: "Reading" },
	{ status: "backlog", label: "Backlog" },
	{ status: "want_to_read", label: "Want to read" },
];

const AUDIOBOOK_SHELF_SECTIONS: Array<ShelfSection<AudiobookShelfStatus>> = [
	{ status: "listening", label: "Listening" },
	{ status: "completed", label: "Completed audiobooks" },
	{ status: "backlog", label: "Audiobook backlog" },
	{ status: "want_to_listen", label: "Want to listen" },
];

export type ShelfBook<TStatus extends string = ShelfStatus> = {
	bookId: number;
	status: TStatus;
	updatedAt: string;
	bookUuid: string;
	bookFilename: string;
	title: string | null;
	cover: string | null;
	mainColor?: string | null;
	authors?: { uuid?: string | null; name: string; role?: string | null }[];
};

export type ProfileShelves<TStatus extends string = ShelfStatus> = {
	byStatus: Map<TStatus, ShelfBook<TStatus>[]>;
	totalByStatus: Map<TStatus, number>;
	allBooks: ShelfBook<TStatus>[];
	isLoading: boolean;
	hasBooks: boolean;
};

/**
 * Loads every shelf for a user in parallel and returns them grouped by status,
 * plus a flattened list (used elsewhere to derive taste chips). Queries are
 * cache-shared, so calling this once and threading the result avoids duplicates.
 */
export function useProfileShelves(username: string): ProfileShelves {
	const shelfQueries = useQueries({
		queries: SHELF_SECTIONS.map((section) => ({
			...orpc.bookShelf.getPublicShelfPaginated.queryOptions({
				input: {
					username,
					status: section.status,
					limit: BOOK_GRID_ITEM_LIMIT,
					offset: 0,
				},
			}),
			staleTime: 60_000,
		})),
	});

	const isLoading = shelfQueries.some((q) => q.isLoading);
	// Per-shelf `data` refs are stable across renders while unchanged (TanStack
	// Query), so memoizing on them avoids rebuilding the grouping every render
	// and keeps the returned object/array identities stable for consumers.
	const [completed, reading, backlog, wantToRead] = shelfQueries.map(
		(query) => query.data,
	);

	return useMemo(() => {
		const dataByOrder = [completed, reading, backlog, wantToRead];
		const byStatus = new Map<ShelfStatus, ShelfBook[]>();
		const totalByStatus = new Map<ShelfStatus, number>();
		const allBooks: ShelfBook[] = [];
		SHELF_SECTIONS.forEach((section, index) => {
			const books = (dataByOrder[index]?.items ?? []) as ShelfBook[];
			byStatus.set(section.status, books);
			totalByStatus.set(section.status, dataByOrder[index]?.total ?? 0);
			allBooks.push(...books);
		});
		return {
			byStatus,
			totalByStatus,
			allBooks,
			isLoading,
			hasBooks: Array.from(totalByStatus.values()).some((total) => total > 0),
		};
	}, [completed, reading, backlog, wantToRead, isLoading]);
}

export function useProfileAudiobookShelves(
	username: string,
): ProfileShelves<AudiobookShelfStatus> {
	const shelfQueries = useQueries({
		queries: AUDIOBOOK_SHELF_SECTIONS.map((section) => ({
			...orpc.audiobookShelf.getPublicShelfPaginated.queryOptions({
				input: {
					username,
					status: section.status,
					limit: AUDIOBOOK_GRID_ITEM_LIMIT,
					offset: 0,
				},
			}),
			staleTime: 60_000,
		})),
	});

	const isLoading = shelfQueries.some((query) => query.isLoading);
	const [listening, completed, backlog, wantToListen] = shelfQueries.map(
		(query) => query.data,
	);

	return useMemo(() => {
		const dataByOrder = [listening, completed, backlog, wantToListen];
		const byStatus = new Map<
			AudiobookShelfStatus,
			ShelfBook<AudiobookShelfStatus>[]
		>();
		const totalByStatus = new Map<AudiobookShelfStatus, number>();
		const allBooks: ShelfBook<AudiobookShelfStatus>[] = [];
		AUDIOBOOK_SHELF_SECTIONS.forEach((section, index) => {
			const books = (dataByOrder[index]?.items ??
				[]) as ShelfBook<AudiobookShelfStatus>[];
			byStatus.set(section.status, books);
			totalByStatus.set(section.status, dataByOrder[index]?.total ?? 0);
			allBooks.push(...books);
		});
		return {
			byStatus,
			totalByStatus,
			allBooks,
			isLoading,
			hasBooks: Array.from(totalByStatus.values()).some((total) => total > 0),
		};
	}, [listening, completed, backlog, wantToListen, isLoading]);
}

function ShelfGrid<TStatus extends string>({
	status,
	label,
	books,
	total,
	onViewMore,
	mediaType,
}: {
	status: TStatus;
	label: string;
	books: ShelfBook<TStatus>[];
	total: number;
	onViewMore: (status: TStatus) => void;
	mediaType: "ebook" | "audiobook";
}) {
	if (books.length === 0) return null;
	const itemLimit =
		mediaType === "audiobook"
			? AUDIOBOOK_GRID_ITEM_LIMIT
			: BOOK_GRID_ITEM_LIMIT;
	return (
		<ScrollSection
			title={
				<span className="inline-flex items-center gap-2">
					{label}
					<Badge
						variant="secondary"
						className="rounded-full bg-muted px-2 text-muted-foreground tabular-nums"
					>
						{total}
					</Badge>
				</span>
			}
			headerAction={
				<button
					type="button"
					onClick={() => onViewMore(status)}
					className="rounded-sm font-medium text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
				>
					{m["nav.show_all"]()}
					<span className="sr-only">: {label}</span>
				</button>
			}
		>
			{books.slice(0, itemLimit).map((book) => (
				<div
					key={book.bookId}
					className={`${DASHBOARD_BOOK_TILE_CLASS} shrink-0`}
				>
					<BookCard
						uuid={book.bookUuid}
						title={book.title}
						filename={book.bookFilename}
						cover={book.cover}
						tint={book.mainColor}
						authors={book.authors}
						coverPreset={coverPresets.small}
						mediaType={mediaType}
						coverFrameRatio={mediaType === "audiobook" ? "square" : "book"}
					/>
				</div>
			))}
		</ScrollSection>
	);
}

interface ShelfSectionsProps<TStatus extends string> {
	sections: Array<ShelfSection<TStatus>>;
	shelves: ProfileShelves<TStatus>;
	onViewMore: (status: TStatus) => void;
	mediaType: "ebook" | "audiobook";
}

function ShelfSections<TStatus extends string>({
	sections,
	shelves,
	onViewMore,
	mediaType,
}: ShelfSectionsProps<TStatus>) {
	const { byStatus, totalByStatus, isLoading, hasBooks } = shelves;

	if (isLoading) {
		return <SectionSkeleton square={mediaType === "audiobook"} />;
	}

	if (!hasBooks) {
		return (
			<div className="flex flex-col items-center rounded-2xl border border-border/60 bg-muted/25 px-6 py-12 text-center">
				<div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
					{mediaType === "audiobook" ? (
						<Headphones aria-hidden="true" className="size-6" />
					) : (
						<BookOpen aria-hidden="true" className="size-6" />
					)}
				</div>
				<p className="font-medium">
					{mediaType === "audiobook" ? m["nav.audiobooks"]() : m["nav.books"]()}
				</p>
				<p className="mt-1 text-muted-foreground text-sm">
					{m["catalog_pages.empty_shelf"]()}
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-10">
			{sections.map((section) => (
				<ShelfGrid
					key={section.status}
					status={section.status}
					label={section.label}
					books={byStatus.get(section.status) ?? []}
					total={totalByStatus.get(section.status) ?? 0}
					onViewMore={onViewMore}
					mediaType={mediaType}
				/>
			))}
		</div>
	);
}

export function BookShelfSections({
	shelves,
	onViewMore,
}: {
	shelves: ProfileShelves;
	onViewMore: (status: ShelfStatus) => void;
}) {
	return (
		<ShelfSections
			sections={SHELF_SECTIONS}
			shelves={shelves}
			onViewMore={onViewMore}
			mediaType="ebook"
		/>
	);
}

export function AudiobookShelfSections({
	shelves,
	onViewMore,
}: {
	shelves: ProfileShelves<AudiobookShelfStatus>;
	onViewMore: (status: AudiobookShelfStatus) => void;
}) {
	return (
		<ShelfSections
			sections={AUDIOBOOK_SHELF_SECTIONS}
			shelves={shelves}
			onViewMore={onViewMore}
			mediaType="audiobook"
		/>
	);
}
