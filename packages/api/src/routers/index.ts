import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { adminRouterGroup } from "./admin";
import { booksRouter } from "./books";
import { filesRouter } from "./files";
import { librariesRouter } from "./libraries";
import { likedBooksRouterGroup } from "./liked-books";
import { profileRouterGroup } from "./profile";
import { readingProgressRouterGroup } from "./reading-progress";
import { setupRouter } from "./setup.router";
import { todoRouter } from "./todo";

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
	todo: todoRouter,
	admin: adminRouterGroup,
	books: booksRouter,
	files: filesRouter,
	libraries: librariesRouter,
	setup: setupRouter,
	readingProgress: readingProgressRouterGroup,
	likedBooks: likedBooksRouterGroup,
	profile: profileRouterGroup,
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
