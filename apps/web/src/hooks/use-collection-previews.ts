import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/utils/orpc";

type CollectionPreviewSource = {
	id: string;
	kind?: "manual" | "dynamic";
	bookCount?: number | null;
	ebookCount?: number | null;
	audiobookCount?: number | null;
	previewCovers?: string[] | null;
	ebookPreviewCovers?: string[] | null;
	audiobookPreviewCovers?: string[] | null;
};

type DynamicPreview = {
	count: number | null;
	ebookCount: number | null;
	audiobookCount: number | null;
	previewCovers: string[];
};

export function resolveCollectionPreview(
	collection: CollectionPreviewSource,
	preview?: DynamicPreview,
) {
	const previewCovers = collection.previewCovers?.length
		? collection.previewCovers
		: (preview?.previewCovers ?? []);

	return {
		count: collection.bookCount ?? preview?.count,
		ebookCount: collection.ebookCount ?? preview?.ebookCount,
		audiobookCount: collection.audiobookCount ?? preview?.audiobookCount,
		previewCovers,
		ebookPreviewCovers: collection.ebookPreviewCovers?.length
			? collection.ebookPreviewCovers
			: collection.kind === "dynamic"
				? (preview?.previewCovers ?? [])
				: (collection.ebookPreviewCovers ??
					collection.previewCovers ??
					preview?.previewCovers ??
					[]),
		audiobookPreviewCovers: collection.audiobookPreviewCovers?.length
			? collection.audiobookPreviewCovers
			: collection.kind === "dynamic"
				? (preview?.previewCovers ?? [])
				: (collection.audiobookPreviewCovers ?? preview?.previewCovers ?? []),
	};
}

export function useCollectionPreviews(collectionIds: string[], enabled = true) {
	const query = useQuery({
		...orpc.collections.previewBatch.queryOptions({
			input: {
				collectionIds,
				timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			},
		}),
		enabled: enabled && collectionIds.length > 0,
		staleTime: 30_000,
	});

	return {
		...query,
		byId: new Map(
			query.data?.map((preview) => [preview.collectionId, preview]),
		),
	};
}
