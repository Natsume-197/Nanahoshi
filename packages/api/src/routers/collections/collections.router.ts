import { hasGlobal } from "../../auth/access.service";
import { ForbiddenError } from "../../errors";
import { orgReadProcedure, requirePermission } from "../../index";
import {
	CreateCollectionInput,
	DeleteCollectionInput,
	GetCollectionDetailsInput,
	ListBookMembershipsInput,
	ListCollectionItemsInput,
	ListCollectionRuleOptionsInput,
	ListPublicCollectionsInput,
	PreviewCollectionBatchInput,
	PreviewDynamicCollectionInput,
	RenameCollectionInput,
	SearchCollectionsInput,
	SetBookMembershipInput,
	UpdateCollectionVisibilityInput,
	UpdateDynamicCollectionInput,
} from "./collections.model";
import * as collectionsService from "./collections.service";

export const collectionsRouter = {
	list: orgReadProcedure.handler(async ({ context }) => {
		if (!hasGlobal(context.pc, "collection", "read")) {
			throw new ForbiddenError("Missing permission: collection:read");
		}
		return collectionsService.listCollections(
			context.session.user.id,
			context.serverId,
			context.accessibleLibraryIds,
		);
	}),

	listPublic: orgReadProcedure
		.input(ListPublicCollectionsInput)
		.handler(async ({ input, context }) => {
			if (!hasGlobal(context.pc, "collection", "read")) {
				throw new ForbiddenError("Missing permission: collection:read");
			}
			return collectionsService.listPublicCollections(
				input.username,
				context.serverId,
				input.limit,
				context.accessibleLibraryIds,
			);
		}),

	// Public collections in the server (any owner) + the viewer's own private ones.
	search: orgReadProcedure
		.input(SearchCollectionsInput)
		.handler(async ({ input, context }) => {
			if (!hasGlobal(context.pc, "collection", "read")) {
				throw new ForbiddenError("Missing permission: collection:read");
			}
			return collectionsService.searchCollections(
				context.session.user.id,
				context.serverId,
				input.query,
				input.limit,
				context.accessibleLibraryIds,
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

	listItems: orgReadProcedure
		.input(ListCollectionItemsInput)
		.handler(async ({ input, context }) => {
			if (!hasGlobal(context.pc, "collection", "read")) {
				throw new ForbiddenError("Missing permission: collection:read");
			}
			return collectionsService.listCollectionItems(
				context.session.user.id,
				input,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	previewDefinition: orgReadProcedure
		.input(PreviewDynamicCollectionInput)
		.handler(async ({ input, context }) => {
			if (
				!hasGlobal(context.pc, "collection", "create") &&
				!hasGlobal(context.pc, "collection", "update")
			) {
				throw new ForbiddenError(
					"Missing permission: collection:create or collection:update",
				);
			}
			return collectionsService.previewDynamicCollection(
				context.session.user.id,
				input,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	previewBatch: orgReadProcedure
		.input(PreviewCollectionBatchInput)
		.handler(async ({ input, context }) => {
			if (!hasGlobal(context.pc, "collection", "read")) {
				throw new ForbiddenError("Missing permission: collection:read");
			}
			return collectionsService.previewCollectionBatch(
				context.session.user.id,
				input,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	listRuleOptions: orgReadProcedure
		.input(ListCollectionRuleOptionsInput)
		.handler(async ({ input, context }) => {
			if (!hasGlobal(context.pc, "collection", "read")) {
				throw new ForbiddenError("Missing permission: collection:read");
			}
			return collectionsService.listCollectionRuleOptions(
				context.session.user.id,
				input,
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
			if (
				input.isPublic &&
				!hasGlobal(context.pc, "collection", "makePublic")
			) {
				throw new ForbiddenError("Missing permission: collection:makePublic");
			}
			return collectionsService.createCollection(
				context.session.user.id,
				input,
				context.serverId,
				context.accessibleLibraryIds,
			);
		}),

	updateDefinition: orgReadProcedure
		.input(UpdateDynamicCollectionInput)
		.handler(async ({ input, context }) => {
			if (!hasGlobal(context.pc, "collection", "update")) {
				throw new ForbiddenError("Missing permission: collection:update");
			}
			return collectionsService.updateDynamicCollection(
				context.session.user.id,
				input,
				context.serverId,
				hasGlobal(context.pc, "collection", "makePublic"),
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
