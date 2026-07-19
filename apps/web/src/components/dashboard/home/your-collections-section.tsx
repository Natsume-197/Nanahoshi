import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import {
	CollectionCard,
	CollectionCardSkeleton,
} from "@/components/shared/collection-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Skeleton } from "@/components/ui/skeleton";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";

const COLLECTION_LIMIT = 10;
const COLLECTION_CARD_CLASS =
	"w-[168px] min-w-[168px] shrink-0 sm:w-[184px] sm:min-w-[184px] lg:w-[200px] lg:min-w-[200px]";
const SKELETON_KEYS = Array.from(
	{ length: 6 },
	(_, index) => `collection-skeleton-${index}`,
);

function CollectionsSkeleton(): JSX.Element {
	return (
		<ScrollSection
			title={<Skeleton as="span" className="inline-block h-7 w-40 rounded" />}
		>
			{SKELETON_KEYS.map((key) => (
				<CollectionCardSkeleton key={key} className={COLLECTION_CARD_CLASS} />
			))}
		</ScrollSection>
	);
}

export const YourCollectionsSection = memo(
	function YourCollectionsSection(): JSX.Element | null {
		const { can, isLoading: abilitiesLoading } = useAbilities();
		const canReadCollections = can("collection", "read");
		const { data: collections, isLoading } = useQuery({
			...orpc.collections.list.queryOptions(),
			staleTime: 30_000,
			enabled: !abilitiesLoading && canReadCollections,
		});

		if (abilitiesLoading || !canReadCollections) return null;
		if (isLoading) return <CollectionsSkeleton />;
		const nonEmptyCollections = collections?.filter(
			(collection) => collection.bookCount > 0,
		);
		if (!nonEmptyCollections || nonEmptyCollections.length === 0) return null;

		return (
			<ScrollSection
				title={m["home.your_collections"]()}
				showAllHref="/dashboard/collections"
			>
				{nonEmptyCollections.slice(0, COLLECTION_LIMIT).map((collection) => (
					<CollectionCard
						key={collection.id}
						id={collection.id}
						name={collection.name}
						previewCovers={collection.previewCovers}
						subtitle={m["media.item_count"]({ count: collection.bookCount })}
						className={COLLECTION_CARD_CLASS}
						isPublic={collection.isPublic}
					/>
				))}
			</ScrollSection>
		);
	},
);
