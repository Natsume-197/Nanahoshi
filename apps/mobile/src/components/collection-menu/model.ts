export type CollectionTarget = {
	id: string;
	name: string;
	isPublic: boolean;
	kind: "manual" | "dynamic";
	isOwner: boolean;
};

export type CollectionAction = "offline" | "edit" | "visibility" | "delete";

/** Which actions a collection offers, grouped into menu sections. Anyone can
 * keep one on the phone; only the owner manages it, and a dynamic
 * collection's visibility lives with its rules. */
export function collectionActions(
	collection: CollectionTarget | null | undefined,
	can: (resource: string, action: string) => boolean,
): CollectionAction[][] {
	if (!collection) return [];
	const phone: CollectionAction[] = ["offline"];
	if (!collection.isOwner) return [phone];
	const manage: CollectionAction[] = [];
	if (can("collection", "update")) manage.push("edit");
	if (collection.kind === "manual" && can("collection", "makePublic")) {
		manage.push("visibility");
	}
	const danger: CollectionAction[] = can("collection", "delete")
		? ["delete"]
		: [];
	return [phone, manage, danger].filter((section) => section.length > 0);
}
