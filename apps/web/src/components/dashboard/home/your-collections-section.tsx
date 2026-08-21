import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { CollectionCard } from "@/components/shared/collection-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc } from "@/utils/orpc";
import { CollectionsSectionSkeleton } from "./home-section-placeholder";
import {
	useHomeSectionLoadingPlaceholder,
	useReportHomeSectionStatus,
} from "./home-section-status";

const COLLECTION_LIMIT = 10;
const COLLECTION_CARD_CLASS =
	"w-[168px] min-w-[168px] shrink-0 sm:w-[184px] sm:min-w-[184px] lg:w-[200px] lg:min-w-[200px]";
export const YourCollectionsSection = memo(
	function YourCollectionsSection(): JSX.Element | null {
		const { can, isLoading: abilitiesLoading } = useAbilities();
		const canReadCollections = can("collection", "read");
		const { data: collections, isLoading } = useQuery({
			...orpc.collections.list.queryOptions(),
			staleTime: 30_000,
			enabled: !abilitiesLoading && canReadCollections,
		});
		const nonEmptyCollections = collections?.filter(
			(collection) => collection.bookCount > 0,
		);
		const loading = abilitiesLoading || (canReadCollections && isLoading);
		useReportHomeSectionStatus(
			loading
				? "loading"
				: canReadCollections && (nonEmptyCollections?.length ?? 0) > 0
					? "populated"
					: "empty",
		);
		const showLoadingPlaceholder = useHomeSectionLoadingPlaceholder();

		if (abilitiesLoading) {
			return showLoadingPlaceholder ? <CollectionsSectionSkeleton /> : null;
		}
		if (!canReadCollections) return null;
		if (isLoading) {
			return showLoadingPlaceholder ? <CollectionsSectionSkeleton /> : null;
		}
		if (!nonEmptyCollections || nonEmptyCollections.length === 0) return null;

		return (
			<ScrollSection
				title={m["home.your_collections"]()}
				showAllHref="/dashboard/collections"
				restoreId="collections"
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
