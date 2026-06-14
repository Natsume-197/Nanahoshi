import { orgProcedure, orgReadProcedure } from "../../index";
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
	list: orgProcedure.handler(async ({ context }) => {
		return collectionsService.listCollections(
			context.session.user.id,
			context.organizationId,
		);
	}),

	getDetails: orgReadProcedure
		.input(GetCollectionDetailsInput)
		.handler(async ({ input, context }) => {
			return collectionsService.getCollectionDetails(
				context.session.user.id,
				input.collectionId,
				context.organizationId,
				context.accessibleLibraryIds,
			);
		}),

	listBookMemberships: orgProcedure
		.input(ListBookMembershipsInput)
		.handler(async ({ input, context }) => {
			return collectionsService.listBookMemberships(
				context.session.user.id,
				input.bookUuid,
				context.organizationId,
			);
		}),

	create: orgProcedure
		.input(CreateCollectionInput)
		.handler(async ({ input, context }) => {
			return collectionsService.createCollection(
				context.session.user.id,
				input,
				context.organizationId,
			);
		}),

	setBookMembership: orgProcedure
		.input(SetBookMembershipInput)
		.handler(async ({ input, context }) => {
			return collectionsService.setBookMembership(
				context.session.user.id,
				input,
				context.organizationId,
			);
		}),

	updateVisibility: orgProcedure
		.input(UpdateCollectionVisibilityInput)
		.handler(async ({ input, context }) => {
			return collectionsService.updateCollectionVisibility(
				context.session.user.id,
				input,
				context.organizationId,
			);
		}),

	rename: orgProcedure
		.input(RenameCollectionInput)
		.handler(async ({ input, context }) => {
			return collectionsService.renameCollection(
				context.session.user.id,
				input,
				context.organizationId,
			);
		}),

	delete: orgProcedure
		.input(DeleteCollectionInput)
		.handler(async ({ input, context }) => {
			return collectionsService.deleteCollection(
				context.session.user.id,
				input.collectionId,
				context.organizationId,
			);
		}),
};
