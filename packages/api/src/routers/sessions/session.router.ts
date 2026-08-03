import { auth } from "@nanahoshi-v2/auth";
import { protectedProcedure } from "../../index";
import { publishSessionsRevoked } from "./session.events";

export const sessionsRouter = {
	revokeAll: protectedProcedure.handler(async ({ context }) => {
		const result = await auth.api.revokeSessions({
			headers: context.req.headers,
		});
		publishSessionsRevoked(context.session.user.id, {
			kind: "sessions_revoked",
			initiatorSessionId: context.session.session.id,
		});
		return result;
	}),
};
