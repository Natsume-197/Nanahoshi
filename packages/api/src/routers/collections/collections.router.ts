import { protectedProcedure } from "../../index";
import {
	CreateCollectionInput,
	DeleteCollectionInput,
	GetCollectionDetailsInput,
	ListBookMembershipsInput,
	SetBookMembershipInput,
	UpdateCollectionVisibilityInput,
} from "./collections.model";
import * as collectionsService from "./collections.service";

export const collectionsRouter = {
	list: protectedProcedure.handler(async ({ context }) => {
		return collectionsService.listCollections(
			context.session.user.id,
			context.session.session.activeOrganizationId ?? undefined,
		);
	}),

	getDetails: protectedProcedure
		.input(GetCollectionDetailsInput)
		.handler(async ({ input, context }) => {
			return collectionsService.getCollectionDetails(
				context.session.user.id,
				input.collectionId,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	listBookMemberships: protectedProcedure
		.input(ListBookMembershipsInput)
		.handler(async ({ input, context }) => {
			return collectionsService.listBookMemberships(
				context.session.user.id,
				input.bookUuid,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	create: protectedProcedure
		.input(CreateCollectionInput)
		.handler(async ({ input, context }) => {
			return collectionsService.createCollection(
				context.session.user.id,
				input,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	setBookMembership: protectedProcedure
		.input(SetBookMembershipInput)
		.handler(async ({ input, context }) => {
			return collectionsService.setBookMembership(
				context.session.user.id,
				input,
				context.session.session.activeOrganizationId ?? undefined,
			);
		}),

	updateVisibility: protectedProcedure
		.input(UpdateCollectionVisibilityInput)
		.handler(async ({ input, context }) => {
			return collectionsService.updateCollectionVisibility(
				context.session.user.id,
				input,
			);
		}),

	delete: protectedProcedure
		.input(DeleteCollectionInput)
		.handler(async ({ input, context }) => {
			return collectionsService.deleteCollection(
				context.session.user.id,
				input.collectionId,
			);
		}),
};
