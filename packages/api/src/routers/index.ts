import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { adminRouter } from "./admin";
import { discordRulesRouter } from "./discord-rules";
import { followRouter } from "./follow";
import { booksRouter } from "./books";
import { collectionsRouter } from "./collections";
import { filesRouter } from "./files";
import { inviteLinksRouter } from "./invite-links";
import { invitationsRouter } from "./invitations";
import { librariesRouter } from "./libraries";
import { likedBooksRouter } from "./liked-books";
import { profileRouter } from "./profile";
import { readingProgressRouter } from "./reading-progress";
import { setupRouter } from "./setup.router";
import { tasksRouter } from "./tasks/task.router";
import { usersRouter } from "./users/users.router";

export const appRouter = {
	healthCheck: publicProcedure.handler(() => {
		return "OK";
	}),
	privateData: protectedProcedure.handler(({ context }) => {
		return {
			message: "This is private",
			user: context.session?.user,
		};
	}),
	admin: adminRouter,
	books: booksRouter,
	collections: collectionsRouter,
	files: filesRouter,
	libraries: librariesRouter,
	setup: setupRouter,
	readingProgress: readingProgressRouter,
	likedBooks: likedBooksRouter,
	profile: profileRouter,
	tasks: tasksRouter,
	invitations: invitationsRouter,
	inviteLinks: inviteLinksRouter,
	users: usersRouter,
	discordRules: discordRulesRouter,
	follow: followRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;

