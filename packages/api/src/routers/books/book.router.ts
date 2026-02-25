import { z } from "zod";
import { protectedProcedure } from "../../index";
import { bookRepository } from "./book.repository";

export const bookRouter = {
	getBookWithMetadata: protectedProcedure
		.input(z.object({ uuid: z.string() }))
		.handler(async ({ input }) => {
			const book = await bookRepository.getWithMetadata(input.uuid);
			if (!book) throw new Error("Book not found");
			return book;
		}),
};
