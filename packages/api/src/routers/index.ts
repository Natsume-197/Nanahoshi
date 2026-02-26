import type { RouterClient } from "@orpc/server";

import { protectedProcedure, publicProcedure } from "../index";
import { todoRouter } from "./todo";
import { booksRouter } from "./books";
import { filesRouter } from "./files";
import { librariesRouter } from "./libraries";
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
  todo: todoRouter,
  books: booksRouter,
  files: filesRouter,
  libraries: librariesRouter,
  setup: setupRouter
};
export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
