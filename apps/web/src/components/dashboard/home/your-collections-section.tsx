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
export const YourCollectionsSection = memo(
	function YourCollectionsSection(): JSX.Element | null {
		const { can, isLoading: abilitiesLoading } = useAbilities();
		const canReadCollections = can("collection", "read");
		const { data: collections, isLoading } = useQuery({
			...orpc.collections.list.queryOptions(),
			staleTime: 30_000,
			enabled: !abilitiesLoading && canReadCollections,
		});
		const candidates = (collections ?? [])
			.filter(
				(collection) =>
					collection.kind === "dynamic" ||
					collection.bookCount == null ||
					collection.bookCount > 0,
			)
			.slice(0, COLLECTION_LIMIT);
		const collectionIds = candidates
			.filter(
				(collection) =>
					collection.kind === "dynamic" || collection.bookCount == null,
			)
			.map((collection) => collection.id);
		const previews = useCollectionPreviews(
			collectionIds,
			!abilitiesLoading && canReadCollections && !isLoading,
		);
		const nonEmptyCollections = candidates.filter((collection) => {
			const { count } = resolveCollectionPreview(
				collection,
				previews.byId.get(collection.id),
			);
			return collection.kind === "dynamic" || count == null || count > 0;
		});
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
				{nonEmptyCollections.map((collection) => {
					const { count, previewCovers } = resolveCollectionPreview(
						collection,
						previews.byId.get(collection.id),
					);
					return (
						<CollectionCard
							key={collection.id}
							id={collection.id}
							name={collection.name}
							previewCovers={previewCovers}
							subtitle={count == null ? "…" : m["media.item_count"]({ count })}
							className={COLLECTION_CARD_CLASS}
							isPublic={collection.isPublic}
							isDynamic={collection.kind === "dynamic"}
						/>
					);
				})}
			</ScrollSection>
		);
	},
);
