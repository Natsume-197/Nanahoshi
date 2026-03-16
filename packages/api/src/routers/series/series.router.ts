import { protectedProcedure } from "../../index";
import { seriesRepository } from "./series.repository";

export const seriesRouter = {
	list: protectedProcedure.handler(async ({ context }) => {
		const organizationId =
			context.session.session.activeOrganizationId ?? undefined;
		return seriesRepository.listWithBookCount(organizationId);
	}),
};
