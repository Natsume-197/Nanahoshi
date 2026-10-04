export type CollectionTarget = {
	id: string;
	name: string;
	isPublic: boolean;
	kind: "manual" | "dynamic";
	isOwner: boolean;
};

export type CollectionAction = "edit" | "visibility" | "delete";

/** Which actions a collection offers, grouped into menu sections. Only the
 * owner gets any; a dynamic collection's visibility lives with its rules. */
export function collectionActions(
	collection: CollectionTarget | null | undefined,
	can: (resource: string, action: string) => boolean,
): CollectionAction[][] {
	if (!collection?.isOwner) return [];
	const manage: CollectionAction[] = [];
	if (can("collection", "update")) manage.push("edit");
	if (collection.kind === "manual" && can("collection", "makePublic")) {
		manage.push("visibility");
	}
	const danger: CollectionAction[] = can("collection", "delete")
		? ["delete"]
		: [];
	return [manage, danger].filter((section) => section.length > 0);
}
