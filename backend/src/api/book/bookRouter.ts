import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Router } from "express";
import { z } from "zod";

import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { validateRequest } from "@/common/utils/httpHandlers";
import { bookController } from "./bookController";
import { BookSchema, CreateBookSchema, GetBookSchema, DeleteBookSchema, GetBooksByLibrarySchema } from "./bookModel";

export const bookRegistry = new OpenAPIRegistry();
export const bookRouter: Router = express.Router();

bookRegistry.register("Book", BookSchema);

bookRegistry.registerPath({
    method: "get",
    path: "/book/{id}",
    tags: ["Book"],
    request: { params: GetBookSchema.shape.params },
    responses: createApiResponse(BookSchema, "Success"),
});
bookRouter.get("/:id", validateRequest(GetBookSchema), bookController.getBook);

bookRegistry.registerPath({
    method: "post",
    path: "/book",
    tags: ["Book"],
    request: {
        body: {
            content: {
                "application/json": {
                    schema: CreateBookSchema
                }
            }
        }
    },
    responses: createApiResponse(BookSchema, "Success"),
});
bookRouter.post("/", validateRequest(CreateBookSchema), bookController.createBook);

bookRegistry.registerPath({
    method: "delete",
    path: "/book/{id}",
    tags: ["Book"],
    request: { params: DeleteBookSchema.shape.params },
    responses: createApiResponse(z.object({ success: z.boolean() }), "Success"),
});
bookRouter.delete("/:id", validateRequest(DeleteBookSchema), bookController.deleteBook);


bookRegistry.registerPath({
    method: "get",
    path: "/book/library/{libraryId}",
    tags: ["Book"],
    request: { params: GetBooksByLibrarySchema.shape.params },
    responses: createApiResponse(z.array(BookSchema), "Success"),
});
bookRouter.get(
    "/library/:libraryId",
    validateRequest(GetBooksByLibrarySchema),
    bookController.getBooksByLibrary
);