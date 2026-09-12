import { useQuery } from "@tanstack/react-query";
import { type JSX, memo } from "react";
import { CollectionCard } from "@/components/shared/collection-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { useAbilities } from "@/hooks/use-abilities";
import {
	resolveCollectionPreview,
	useCollectionPreviews,
} from "@/hooks/use-collection-previews";
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

export const DiscoverCollectionsSection = memo(
	function DiscoverCollectionsSection(): JSX.Element | null {
		const { can, isLoading: abilitiesLoading } = useAbilities();
		const canReadCollections = can("collection", "read");
		const { data: collections, isLoading } = useQuery({
			...orpc.collections.discover.queryOptions({ input: { limit: 20 } }),
			staleTime: 60_000,
			enabled: !abilitiesLoading && canReadCollections,
		});
		const collectionIds = (collections ?? [])
			.filter(
				(collection) =>
					collection.kind === "dynamic" || collection.bookCount == null,
			)
			.map((collection) => collection.id);
		const previews = useCollectionPreviews(
			collectionIds,
			!abilitiesLoading && canReadCollections && !isLoading,
		);
		const loadingPreviews = collectionIds.length > 0 && previews.isLoading;
		const visibleCollections = (collections ?? [])
			.filter((collection) => {
				const { count } = resolveCollectionPreview(
					collection,
					previews.byId.get(collection.id),
				);
				return count != null && count > 0;
			})
			.slice(0, COLLECTION_LIMIT);
		const loading =
			abilitiesLoading ||
			(canReadCollections && (isLoading || loadingPreviews));
		useReportHomeSectionStatus(
			loading
				? "loading"
				: canReadCollections && visibleCollections.length > 0
					? "populated"
					: "empty",
		);
		const showLoadingPlaceholder = useHomeSectionLoadingPlaceholder();

		if (loading) {
			return showLoadingPlaceholder ? <CollectionsSectionSkeleton /> : null;
		}
		if (!canReadCollections || visibleCollections.length === 0) return null;

		return (
			<ScrollSection
				title={m["home.discover_collections"]()}
				showAllHref="/dashboard/collections"
				showAllSearch={{ tab: "discover" }}
				restoreId="discover-collections"
			>
				{visibleCollections.map((collection) => {
					const { previewCovers } = resolveCollectionPreview(
						collection,
						previews.byId.get(collection.id),
					);
					return (
						<CollectionCard
							key={collection.id}
							id={collection.id}
							name={collection.name}
							previewCovers={previewCovers}
							subtitle={collection.ownerName ?? collection.ownerUsername}
							className={COLLECTION_CARD_CLASS}
							readOnly
							isDynamic={collection.kind === "dynamic"}
						/>
					);
				})}
			</ScrollSection>
		);
	},
);
