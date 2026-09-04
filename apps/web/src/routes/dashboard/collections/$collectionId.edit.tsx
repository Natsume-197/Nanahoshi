import type { DynamicCollectionDefinitionV1 } from "@nanahoshi-v2/api/routers/collections/collection-rules";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { DynamicCollectionEditor } from "@/components/collections/dynamic-collection-editor";
import { EmptyState } from "@/components/shared/empty-state";
import { PAGE_SHELL } from "@/lib/page-layout";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute(
	"/dashboard/collections/$collectionId/edit",
)({ component: EditDynamicCollectionPage });

function EditDynamicCollectionPage() {
	const { collectionId } = Route.useParams();
	const navigate = useNavigate();
	const details = useQuery({
		...orpc.collections.getDetails.queryOptions({ input: { collectionId } }),
	});
	const mutation = useMutation({
		...orpc.collections.updateDefinition.mutationOptions(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: orpc.collections.key() });
			toast.success("Dynamic collection updated");
			navigate({
				to: "/dashboard/collections/$collectionId",
				params: { collectionId },
			});
		},
		onError: (error) => toast.error(error.message),
	});
	const collection = details.data?.collection;
	if (details.isLoading)
		return (
			<main className={PAGE_SHELL}>
				<p className="text-muted-foreground">Loading collection…</p>
			</main>
		);
	if (collection?.kind !== "dynamic" || !collection.isOwner)
		return (
			<main className={PAGE_SHELL}>
				<EmptyState
					title="Cannot edit this collection"
					description="Only the owner can edit a valid dynamic collection."
				/>
			</main>
		);
	return (
		<main>
			<DynamicCollectionEditor
				open
				onOpenChange={(next) => {
					if (!next) {
						navigate({
							to: "/dashboard/collections/$collectionId",
							params: { collectionId },
						});
					}
				}}
				title={m["collection.dynamic_editor_edit_title"]()}
				description={m["collection.dynamic_editor_edit_desc"]()}
				initial={
					collection.definitionStatus === "valid"
						? (collection.dynamicDefinition as DynamicCollectionDefinitionV1)
						: undefined
				}
				initialName={collection.name}
				initialDescription={collection.description}
				initialPublic={collection.isPublic}
				submitLabel={m["common.save"]()}
				isSubmitting={mutation.isPending}
				onSubmit={(value) => mutation.mutateAsync({ collectionId, ...value })}
			/>
		</main>
	);
}
