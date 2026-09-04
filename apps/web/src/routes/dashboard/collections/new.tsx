import { DynamicCollectionDefinitionSchema } from "@nanahoshi-v2/api/routers/collections/collection-rules";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { DynamicCollectionEditor } from "@/components/collections/dynamic-collection-editor";
import { useAbilities } from "@/hooks/use-abilities";
import { m } from "@/paraglide/messages";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/collections/new")({
	component: NewDynamicCollectionPage,
	validateSearch: (search: Record<string, unknown>) => ({
		draft: typeof search.draft === "string" ? search.draft : undefined,
	}),
});

function NewDynamicCollectionPage() {
	const navigate = useNavigate();
	const { draft } = Route.useSearch();
	const parsedDraft = (() => {
		if (!draft) return undefined;
		try {
			const result = DynamicCollectionDefinitionSchema.safeParse(
				JSON.parse(draft),
			);
			return result.success ? result.data : undefined;
		} catch {
			return undefined;
		}
	})();
	const { can } = useAbilities();
	const mutation = useMutation({
		...orpc.collections.create.mutationOptions(),
		onSuccess: async (collection) => {
			await queryClient.invalidateQueries({
				queryKey: orpc.collections.list.key(),
			});
			toast.success("Dynamic collection created");
			navigate({
				to: "/dashboard/collections/$collectionId",
				params: { collectionId: collection.id },
			});
		},
		onError: (error) => toast.error(error.message),
	});

	if (!can("collection", "create")) return null;
	return (
		<main>
			<DynamicCollectionEditor
				open
				onOpenChange={(next) => {
					if (!next) navigate({ to: "/dashboard/collections" });
				}}
				title={m["collection.dynamic_editor_create_title"]()}
				description={m["collection.dynamic_editor_create_desc"]()}
				initial={parsedDraft}
				submitLabel={m["common.create"]()}
				isSubmitting={mutation.isPending}
				onSubmit={(value) =>
					mutation.mutateAsync({ ...value, kind: "dynamic" })
				}
			/>
		</main>
	);
}
