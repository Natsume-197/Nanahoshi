import { hasGlobal } from "../../auth/access.service";
import { ForbiddenError } from "../../errors";
import { orgReadProcedure, requirePermission } from "../../index";
import {
	CreateCollectionInput,
	DeleteCollectionInput,
	GetCollectionDetailsInput,
	ListBookMembershipsInput,
	ListPublicCollectionsInput,
	RenameCollectionInput,
	SearchCollectionsInput,
	SetBookMembershipInput,
	UpdateCollectionVisibilityInput,
} from "./collections.model";
import * as collectionsService from "./collections.service";

export const collectionsRouter = {
	list: requirePermission("collection", "read").handler(async ({ context }) => {
		return collectionsService.listCollections(
			context.session.user.id,
			context.serverId,
		);
	}),

	listPublic: requirePermission("collection", "read")
		.input(ListPublicCollectionsInput)
		.handler(async ({ input, context }) => {
			return collectionsService.listPublicCollections(
				input.username,
				context.serverId,
				input.limit,
			);
		}),

	// Public collections in the server (any owner) + the viewer's own private ones.
	search: requirePermission("collection", "read")
		.input(SearchCollectionsInput)
		.handler(async ({ input, context }) => {
			return collectionsService.searchCollections(
				context.session.user.id,
				context.serverId,
				input.query,
				input.limit,
			);
		}),

	// orgReadProcedure for accessibleLibraryIds; collection:read checked inline.
	getDetails: orgReadProcedure
		.input(GetCollectionDetailsInput)
		.handler(async ({ input, context }) => {
			if (!hasGlobal(context.pc, "collection", "read")) {
				throw new ForbiddenError("Missing permission: collection:read");
			}
			return collectionsService.getCollectionDetails(
				context.session.user.id,
				input.collectionId,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	listBookMemberships: orgReadProcedure
		.input(ListBookMembershipsInput)
		.handler(async ({ input, context }) => {
			if (!hasGlobal(context.pc, "collection", "read")) {
				throw new ForbiddenError("Missing permission: collection:read");
			}
			return collectionsService.listBookMemberships(
				context.session.user.id,
				input.bookUuid,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	create: orgReadProcedure
		.input(CreateCollectionInput)
		.handler(async ({ input, context }) => {
			if (!hasGlobal(context.pc, "collection", "create")) {
				throw new ForbiddenError("Missing permission: collection:create");
			}
			return collectionsService.createCollection(
				context.session.user.id,
				input,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	setBookMembership: orgReadProcedure
		.input(SetBookMembershipInput)
		.handler(async ({ input, context }) => {
			if (!hasGlobal(context.pc, "collection", "update")) {
				throw new ForbiddenError("Missing permission: collection:update");
			}
			return collectionsService.setBookMembership(
				context.session.user.id,
				input,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	updateVisibility: requirePermission("collection", "makePublic")
		.input(UpdateCollectionVisibilityInput)
		.handler(async ({ input, context }) => {
			return collectionsService.updateCollectionVisibility(
				context.session.user.id,
				input,
				context.serverId,
			);
		}),

	rename: requirePermission("collection", "update")
		.input(RenameCollectionInput)
		.handler(async ({ input, context }) => {
			return collectionsService.renameCollection(
				context.session.user.id,
				input,
				context.serverId,
			);
		}),

	delete: requirePermission("collection", "delete")
		.input(DeleteCollectionInput)
		.handler(async ({ input, context }) => {
			return collectionsService.deleteCollection(
				context.session.user.id,
				input.collectionId,
				context.serverId,
			);
		}),
};
