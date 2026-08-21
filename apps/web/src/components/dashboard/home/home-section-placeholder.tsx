import type { JSX } from "react";
import { CollectionCardSkeleton } from "@/components/shared/collection-card";
import { ScrollSection } from "@/components/shared/scroll-section";
import { Skeleton } from "@/components/ui/skeleton";
import type { HomeSectionId } from "@/lib/home-layout-store";
import { getHomeSectionPlaceholderKind } from "./home-section-placeholder-kind";
import { ResumeSectionSkeleton, SectionSkeleton } from "./section-skeleton";

const COLLECTION_CARD_CLASS =
	"w-[168px] min-w-[168px] shrink-0 sm:w-[184px] sm:min-w-[184px] lg:w-[200px] lg:min-w-[200px]";
const COLLECTION_SKELETON_KEYS = Array.from(
	{ length: 6 },
	(_, index) => `collection-skeleton-${index}`,
);

export function CollectionsSectionSkeleton(): JSX.Element {
	return (
		<ScrollSection
			title={<Skeleton as="span" className="inline-block h-7 w-40 rounded" />}
		>
			{COLLECTION_SKELETON_KEYS.map((key) => (
				<CollectionCardSkeleton key={key} className={COLLECTION_CARD_CLASS} />
			))}
		</ScrollSection>
	);
}

export function HomeSectionPlaceholder({
	id,
}: {
	id: HomeSectionId;
}): JSX.Element {
	const kind = getHomeSectionPlaceholderKind(id);

	if (kind === "resume") return <ResumeSectionSkeleton />;
	if (kind === "collections") return <CollectionsSectionSkeleton />;
	return <SectionSkeleton square={kind === "square"} />;
}
