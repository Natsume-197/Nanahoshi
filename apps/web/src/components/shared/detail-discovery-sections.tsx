import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { BookCard } from "@/components/books/book-card";
import { selectMoreByAuthorItems } from "@/components/shared/more-by-author-items";
import { ScrollSection } from "@/components/shared/scroll-section";
import { SimilarItemsSection } from "@/components/shared/similar-items-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { client } from "@/utils/orpc";

const SEARCH_LIMIT = 20;

type Author = {
	uuid?: string | null;
	name: string;
};

export function DetailDiscoverySections({
	bookUuid,
	authors,
	seriesUuid,
}: {
	bookUuid: string;
	authors?: Author[] | null;
	seriesUuid?: string | null;
}) {
	const linkedAuthors = useMemo(() => {
		const byUuid = new Map<string, Author & { uuid: string }>();
		for (const author of authors ?? []) {
			if (author.uuid)
				byUuid.set(author.uuid, { ...author, uuid: author.uuid });
		}
		return [...byUuid.values()];
	}, [authors]);
	const authorUuids = linkedAuthors.map((author) => author.uuid);
	const enabled = authorUuids.length > 0;

	const booksQuery = useQuery({
		queryKey: ["books", "more-by-author", authorUuids],
		queryFn: () =>
			client.books.search({
				filters: { authorUuids },
				sort: "newest",
				limit: SEARCH_LIMIT,
			}),
		enabled,
		staleTime: 60_000,
	});
	const audiobooksQuery = useQuery({
		queryKey: ["audiobooks", "more-by-author", authorUuids],
		queryFn: () =>
			client.audiobooks.search({
				filters: { authorUuids },
				sort: "newest",
				limit: SEARCH_LIMIT,
			}),
		enabled,
		staleTime: 60_000,
	});

	const items = useMemo(
		() =>
			selectMoreByAuthorItems(
				[
					...(booksQuery.data?.books ?? []).map((book) => ({
						uuid: book.uuid,
						title: book.title,
						filename: book.filename,
						cover: book.cover,
						mainColor:
							(book as typeof book & { mainColor?: string | null }).mainColor ??
							book.color,
						authors: book.authors ?? [],
						seriesUuid: book.series?.uuid,
						createdAt: book.createdAt,
						mediaType: "ebook" as const,
					})),
					...(audiobooksQuery.data?.audiobooks ?? []).map((audiobook) => ({
						uuid: audiobook.uuid,
						title: audiobook.title,
						filename: audiobook.filename,
						cover: audiobook.cover,
						mainColor: audiobook.mainColor,
						authors: audiobook.authors ?? [],
						seriesUuid: audiobook.series?.uuid,
						createdAt: audiobook.createdAt,
						mediaType: "audiobook" as const,
					})),
				],
				bookUuid,
				seriesUuid,
			),
		[booksQuery.data, audiobooksQuery.data, bookUuid, seriesUuid],
	);
	const usesSquareCoverFrame = items.every(
		(item) => item.mediaType === "audiobook",
	);
	const heading =
		linkedAuthors.length === 1
			? m["recs.more_by_author"]({ author: linkedAuthors[0].name })
			: m["recs.more_by_authors"]();

	return (
		<>
			{items.length > 0 && (
				<div className="mt-14 sm:mt-16">
					<ScrollSection
						title={heading}
						showAllHref={
							linkedAuthors.length === 1
								? `/dashboard/authors/${linkedAuthors[0].uuid}`
								: undefined
						}
						restoreId="more-by-author"
					>
						{items.map((item) => (
							<div
								key={item.uuid}
								className="w-[120px] shrink-0 rounded-lg md:w-[140px]"
							>
								<BookCard
									uuid={item.uuid}
									title={item.title}
									filename={item.filename}
									cover={item.cover ?? null}
									tint={item.mainColor}
									authors={item.authors}
									mediaType={item.mediaType}
									coverFrameRatio={usesSquareCoverFrame ? "square" : "book"}
									contextMenuEnabled={false}
									coverPreset={coverPresets.small}
								/>
							</div>
						))}
					</ScrollSection>
				</div>
			)}

			<SimilarItemsSection
				bookUuid={bookUuid}
				excludeBookUuids={items.map((item) => item.uuid)}
				className="mt-14 sm:mt-16"
			/>
		</>
	);
}
