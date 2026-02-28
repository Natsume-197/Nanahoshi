import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { adminRouter } from "./admin";
import { booksRouter } from "./books";
import { filesRouter } from "./files";
import { librariesRouter } from "./libraries";
import { likedBooksRouter } from "./liked-books";
import { profileRouter } from "./profile";
import { readingProgressRouter } from "./reading-progress";
import { setupRouter } from "./setup.router";

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
	files: filesRouter,
	libraries: librariesRouter,
	setup: setupRouter,
	readingProgress: readingProgressRouter,
	likedBooks: likedBooksRouter,
	profile: profileRouter,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
