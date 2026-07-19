import { useQuery } from "@tanstack/react-query";
import type { JSX } from "react";
import { BookCard } from "@/components/books/book-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { m } from "@/paraglide/messages";
import { coverPresets } from "@/utils/covers";
import { orpc } from "@/utils/orpc";

export function SimilarItemsSection({
	bookUuid,
}: {
	bookUuid: string;
}): JSX.Element | null {
	const { data, isLoading } = useQuery(
		orpc.recommendations.similarToBook.queryOptions({
			input: { bookUuid },
		}),
	);

	if (isLoading) return null;
	if (!data?.enabled || data.items.length === 0) return null;

	return (
		<ScrollSection title={m["recs.similar_title"]()} restoreId="similar">
			{data.items.map((item) => (
				<div
					key={item.book.uuid}
					className="w-[120px] shrink-0 rounded-lg md:w-[140px]"
				>
					<BookCard
						uuid={item.book.uuid}
						title={item.seriesName ?? item.book.title}
						filename={item.book.filename}
						cover={item.book.cover}
						authors={item.book.authors}
						mediaType={item.book.mediaType}
						contextMenuEnabled={false}
						coverPreset={coverPresets.small}
					/>
				</div>
			))}
		</ScrollSection>
	);
}
