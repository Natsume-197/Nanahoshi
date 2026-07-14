import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

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
	{ status: "reading", label: "Reading" },
	{ status: "completed", label: "Completed" },
	{ status: "backlog", label: "Backlog" },
	{ status: "want_to_read", label: "Want to read" },
];

const AUDIOBOOK_SHELF_SECTIONS: Array<ShelfSection<AudiobookShelfStatus>> = [
	{ status: "listening", label: "Listening" },
	{ status: "completed", label: "Completed" },
	{ status: "backlog", label: "Backlog" },
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
			...orpc.bookShelf.getPublicShelf.queryOptions({
				input: { username, status: section.status, limit: 18 },
			}),
			staleTime: 60_000,
		})),
	});

	const isLoading = shelfQueries.some((q) => q.isLoading);
	// Per-shelf `data` refs are stable across renders while unchanged (TanStack
	// Query), so memoizing on them avoids rebuilding the grouping every render
	// and keeps the returned object/array identities stable for consumers.
	const [reading, completed, backlog, wantToRead] = shelfQueries.map(
		(q) => q.data as ShelfBook[] | undefined,
	);

	return useMemo(() => {
		const dataByOrder = [reading, completed, backlog, wantToRead];
		const byStatus = new Map<ShelfStatus, ShelfBook[]>();
		const allBooks: ShelfBook[] = [];
		SHELF_SECTIONS.forEach((section, index) => {
			const books = dataByOrder[index] ?? [];
			byStatus.set(section.status, books);
			allBooks.push(...books);
		});
		return { byStatus, allBooks, isLoading, hasBooks: allBooks.length > 0 };
	}, [reading, completed, backlog, wantToRead, isLoading]);
}

export function useProfileAudiobookShelves(
	username: string,
): ProfileShelves<AudiobookShelfStatus> {
	const shelfQueries = useQueries({
		queries: AUDIOBOOK_SHELF_SECTIONS.map((section) => ({
			...orpc.audiobookShelf.getPublicShelf.queryOptions({
				input: { username, status: section.status, limit: 18 },
			}),
			staleTime: 60_000,
		})),
	});

	const isLoading = shelfQueries.some((query) => query.isLoading);
	const [listening, completed, backlog, wantToListen] = shelfQueries.map(
		(query) => query.data as ShelfBook<AudiobookShelfStatus>[] | undefined,
	);

	return useMemo(() => {
		const dataByOrder = [listening, completed, backlog, wantToListen];
		const byStatus = new Map<
			AudiobookShelfStatus,
			ShelfBook<AudiobookShelfStatus>[]
		>();
		const allBooks: ShelfBook<AudiobookShelfStatus>[] = [];
		AUDIOBOOK_SHELF_SECTIONS.forEach((section, index) => {
			const books = dataByOrder[index] ?? [];
			byStatus.set(section.status, books);
			allBooks.push(...books);
		});
		return { byStatus, allBooks, isLoading, hasBooks: allBooks.length > 0 };
	}, [listening, completed, backlog, wantToListen, isLoading]);
}

function ShelfCard<TStatus extends string>({
	status,
	label,
	books,
	onViewMore,
	mediaType,
}: {
	status: TStatus;
	label: string;
	books: ShelfBook<TStatus>[];
	onViewMore: (status: TStatus) => void;
	mediaType: "ebook" | "audiobook";
}) {
	if (books.length === 0) return null;
	const preview = books.slice(0, 6);

	return (
		<div className="overflow-hidden rounded-lg border border-border/70 bg-card/40 transition-colors hover:border-border">
			<div className="flex h-12 items-stretch">
				<div className="relative flex items-center gap-2 px-4">
					<span className="font-semibold text-sm">{label}</span>
					<Badge>{books.length}</Badge>
					<span
						className="absolute inset-x-0 bottom-0 h-0.5 bg-primary"
						aria-hidden="true"
					/>
				</div>
			</div>
			<div className="p-4">
				<div className="grid grid-cols-6 gap-2">
					{preview.map((book) => (
						<BookCard
							key={book.bookId}
							uuid={book.bookUuid}
							title={book.title}
							filename={book.bookFilename}
							cover={book.cover}
							authors={book.authors}
							coverPreset={coverPresets.small}
							mediaType={mediaType}
						/>
					))}
				</div>
				<div className="flex justify-end pt-3">
					<Button
						variant="outline"
						size="sm"
						onClick={() => onViewMore(status)}
					>
						View more
					</Button>
				</div>
			</div>
		</div>
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
	const { byStatus, isLoading, hasBooks } = shelves;

	if (isLoading) {
		return (
			<div className="grid gap-3 sm:grid-cols-1">
				{["s1", "s2", "s3", "s4"].map((id) => (
					<div
						key={id}
						className="h-[120px] animate-pulse rounded-lg border border-border/70 bg-card/40"
					/>
				))}
			</div>
		);
	}

	if (!hasBooks) {
		return (
			<div className="rounded-lg border border-border/70 border-dashed bg-card/30 px-6 py-12 text-center text-muted-foreground text-sm">
				No {mediaType === "audiobook" ? "audiobooks" : "books"} on any shelf
				yet.
			</div>
		);
	}

	return (
		<div className="grid gap-3 sm:grid-cols-1">
			{sections.map((section) => (
				<ShelfCard
					key={section.status}
					status={section.status}
					label={section.label}
					books={byStatus.get(section.status) ?? []}
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
