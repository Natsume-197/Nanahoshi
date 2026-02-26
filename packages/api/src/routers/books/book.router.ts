import { z } from "zod";
import { protectedProcedure } from "../../index";
import * as bookService from "./book.service";

export const bookRouter = {
	getBookWithMetadata: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input }) => {
			return await bookService.getBookWithMetadata(input.uuid);
		}),

	search: protectedProcedure
		.input(z.object({ query: z.string() }))
		.handler(async ({ input }) => {
			return await bookService.searchBooks(input.query);
		}),
};
