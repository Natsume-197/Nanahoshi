import { hasGlobal } from "../../auth/access.service";
import { ForbiddenError } from "../../errors";
import { orgReadProcedure, requirePermission } from "../../index";
import {
	CreateCollectionInput,
	DeleteCollectionInput,
	GetCollectionDetailsInput,
	ListBookMembershipsInput,
	RenameCollectionInput,
	SetBookMembershipInput,
	UpdateCollectionVisibilityInput,
} from "./collections.model";
import * as collectionsService from "./collections.service";

export const collectionsRouter = {
	list: requirePermission("collection", "read").handler(async ({ context }) => {
		return collectionsService.listCollections(
			context.session.user.id,
			context.organizationId,
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
				context.organizationId,
				context.accessibleLibraryIds,
			);
		}),

	listBookMemberships: requirePermission("collection", "read")
		.input(ListBookMembershipsInput)
		.handler(async ({ input, context }) => {
			return collectionsService.listBookMemberships(
				context.session.user.id,
				input.bookUuid,
				context.organizationId,
			);
		}),

	create: requirePermission("collection", "create")
		.input(CreateCollectionInput)
		.handler(async ({ input, context }) => {
			return collectionsService.createCollection(
				context.session.user.id,
				input,
				context.organizationId,
			);
		}),

	setBookMembership: requirePermission("collection", "update")
		.input(SetBookMembershipInput)
		.handler(async ({ input, context }) => {
			return collectionsService.setBookMembership(
				context.session.user.id,
				input,
				context.organizationId,
			);
		}),

	updateVisibility: requirePermission("collection", "makePublic")
		.input(UpdateCollectionVisibilityInput)
		.handler(async ({ input, context }) => {
			return collectionsService.updateCollectionVisibility(
				context.session.user.id,
				input,
				context.organizationId,
			);
		}),

	rename: requirePermission("collection", "update")
		.input(RenameCollectionInput)
		.handler(async ({ input, context }) => {
			return collectionsService.renameCollection(
				context.session.user.id,
				input,
				context.organizationId,
			);
		}),

	delete: requirePermission("collection", "delete")
		.input(DeleteCollectionInput)
		.handler(async ({ input, context }) => {
			return collectionsService.deleteCollection(
				context.session.user.id,
				input.collectionId,
				context.organizationId,
			);
		}),
};
