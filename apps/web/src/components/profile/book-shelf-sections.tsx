import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BookOpen, Check, Clock, Heart } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
	getCoverPresetUrl,
	getCoverSrcSet,
	coverPresets,
} from "@/utils/covers";
import { orpc } from "@/utils/orpc";

type ShelfStatus = "want_to_read" | "backlog" | "reading" | "completed";

const SHELF_SECTIONS: Array<{
	status: ShelfStatus;
	label: string;
	color: string;
}> = [
		{
			status: "reading",
			label: "Reading",
			color: "text-chart-1",
		},
		{
			status: "completed",
			label: "Completed",
			color: "text-chart-4",
		},
		{
			status: "backlog",
			label: "Backlog",
			color: "text-muted-foreground",
		},
		{
			status: "want_to_read",
			label: "Want to Read",
			color: "text-destructive",
		},
	];

type ShelfBook = {
	bookId: number;
	status: ShelfStatus;
	updatedAt: string;
	bookUuid: string;
	bookFilename: string;
	title: string | null;
	cover: string | null;
	mainColor: string | null;
};

function BookCoverCard({ book }: { book: ShelfBook }) {
	const coverFilename = book.cover?.split("/").pop();
	const displayTitle = book.title ?? book.bookFilename;

	return (
		<Link
			to="/dashboard/books/$uuid"
			params={{ uuid: book.bookUuid }}
			className="group flex flex-col gap-1.5"
		>
			<div
				className="relative overflow-hidden rounded-md shadow-sm ring-1 ring-white/10 transition-all duration-300 group-hover:shadow-md group-hover:ring-white/20"
				style={{ aspectRatio: "2/3" }}
			>
				{coverFilename ? (
					<img
						src={getCoverPresetUrl(coverFilename, coverPresets.card)}
						srcSet={getCoverSrcSet(coverFilename, coverPresets.card.widths)}
						sizes={coverPresets.card.sizes}
						alt={displayTitle}
						className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
						loading="lazy"
						decoding="async"
					/>
				) : (
					<div
						className="flex h-full w-full items-center justify-center bg-muted/60 p-2"
						style={
							book.mainColor
								? { backgroundColor: `${book.mainColor}33` }
								: undefined
						}
					>
						<span className="line-clamp-3 text-center text-[10px] text-muted-foreground">
							{displayTitle}
						</span>
					</div>
				)}
			</div>
			<p className="line-clamp-2 text-[11px] leading-tight text-foreground/70 group-hover:text-foreground">
				{displayTitle}
			</p>
		</Link>
	);
}

function ShelfSection({
	username,
	status,
	label,
	color,
	isOwnProfile,
}: {
	username: string;
	status: ShelfStatus;
	label: string;
	color: string;
	isOwnProfile: boolean;
}) {
	const query = useQuery({
		...orpc.bookShelf.getPublicShelf.queryOptions({
			input: { username, status, limit: 12 },
		}),
		staleTime: 60_000,
	});

	// Don't show empty sections for other users' profiles
	if (!isOwnProfile && !query.isLoading && (!query.data || query.data.length === 0)) {
		return null;
	}

	return (
		<section className="space-y-3">
			{/* Section header */}
			<div className="flex items-center gap-2.5 border-b border-border/40 pb-3">
				<h3 className="font-semibold text-foreground/90 text-sm">{label}</h3>
				{query.data && query.data.length > 0 && (
					<span className="ml-1 flex items-center rounded-full bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
						{query.data.length}
					</span>
				)}
			</div>

			{/* Grid */}
			{query.isLoading ? (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-3">
					{Array.from({ length: 5 }, (_, i) => i).map((i) => (
						<div key={i} className="space-y-1.5">
							<Skeleton className="aspect-[2/3] w-full rounded-md bg-muted/40" />
							<Skeleton className="h-3 w-3/4 rounded bg-muted/40" />
						</div>
					))}
				</div>
			) : query.data && query.data.length > 0 ? (
				<div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-3">
					{query.data.map((book) => (
						<BookCoverCard key={book.bookId} book={book as ShelfBook} />
					))}
				</div>
			) : (
				<p className="py-4 text-center text-muted-foreground text-xs italic">
					{isOwnProfile
						? `No books marked as "${label}" yet.`
						: `No books here.`}
				</p>
			)}
		</section>
	);
}

interface BookShelfSectionsProps {
	username: string;
	isOwnProfile: boolean;
}

export function BookShelfSections({
	username,
	isOwnProfile,
}: BookShelfSectionsProps) {
	return (
		<div className="space-y-8">
			{SHELF_SECTIONS.map((section) => (
				<ShelfSection
					key={section.status}
					username={username}
					status={section.status}
					label={section.label}
					color={section.color}
					isOwnProfile={isOwnProfile}
				/>
			))}
		</div>
	);
}
