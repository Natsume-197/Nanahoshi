import { useQueries } from "@tanstack/react-query";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

export type ShelfStatus = "want_to_read" | "backlog" | "reading" | "completed";

const SHELF_SECTIONS: Array<{
	status: ShelfStatus;
	label: string;
	dot: string;
}> = [
	{ status: "reading", label: "Reading", dot: "bg-chart-1" },
	{ status: "completed", label: "Completed", dot: "bg-chart-4" },
	{ status: "backlog", label: "Backlog", dot: "bg-muted-foreground" },
	{ status: "want_to_read", label: "Want to read", dot: "bg-destructive" },
];

export type ShelfBook = {
	bookId: number;
	status: ShelfStatus;
	updatedAt: string;
	bookUuid: string;
	bookFilename: string;
	title: string | null;
	cover: string | null;
	mainColor: string | null;
	authors?: { uuid?: string | null; name: string; role?: string | null }[];
};

export type ProfileShelves = {
	byStatus: Map<ShelfStatus, ShelfBook[]>;
	allBooks: ShelfBook[];
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

function ShelfCard({
	label,
	dot,
	books,
}: {
	label: string;
	dot: string;
	books: ShelfBook[];
}) {
	if (books.length === 0) return null;
	const preview = books.slice(0, 6);

	return (
		<div className="flex flex-col gap-3 rounded-lg border border-border/70 bg-card/40 p-4 transition-colors hover:border-border">
			<div className="flex items-center gap-2">
				<span className={`size-2.5 shrink-0 rounded-full ${dot}`} aria-hidden />
				<span className="font-semibold text-sm">{label}</span>
				<span className="ml-auto flex items-center rounded-md bg-muted/60 px-2 py-0.5 font-bold text-[11px] text-muted-foreground/80 tabular-nums ring-1 ring-border/50">
					{books.length}
				</span>
			</div>
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
					/>
				))}
			</div>
		</div>
	);
}

interface BookShelfSectionsProps {
	shelves: ProfileShelves;
}

export function BookShelfSections({ shelves }: BookShelfSectionsProps) {
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
				No books on any shelf yet.
			</div>
		);
	}

	return (
		<div className="grid gap-3 sm:grid-cols-1">
			{SHELF_SECTIONS.map((section) => (
				<ShelfCard
					key={section.status}
					label={section.label}
					dot={section.dot}
					books={byStatus.get(section.status) ?? []}
				/>
			))}
		</div>
	);
}
