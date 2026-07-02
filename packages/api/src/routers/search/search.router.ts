import { orgReadProcedure } from "../../index";
import { TopSearchInput } from "./search.model";
import * as searchService from "./search.service";

export const searchRouter = {
	top: orgReadProcedure
		.input(TopSearchInput)
		.handler(async ({ input, context }) => {
			return searchService.topResults({
				query: input.query,
				limit: input.limit,
				userId: context.session.user.id,
				serverId: context.serverId,
				accessibleLibraryIds: context.accessibleLibraryIds,
				pc: context.pc,
			});
		}),
};
