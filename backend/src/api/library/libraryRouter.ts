import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import express, { type Router } from "express";
import { z } from "zod";

import { createApiResponse } from "@/api-docs/openAPIResponseBuilders";
import { validateRequest } from "@/common/utils/httpHandlers";
import { libraryController } from "./libraryController";
import { CreateLibrarySchema, GetLibrarySchema, LibrarySchema, LibraryWithPathsSchema } from "./libraryModel";

export const libraryRegistry = new OpenAPIRegistry();
export const libraryRouter: Router = express.Router();

libraryRegistry.register("Library", LibrarySchema);

libraryRegistry.registerPath({
    method: "get",
    path: "/library",
    tags: ["Library"],
    responses: createApiResponse(z.array(LibrarySchema), "Success"),
});
libraryRouter.get("/", libraryController.getLibraries);

libraryRegistry.registerPath({
    method: "get",
    path: "/library/{id}",
    tags: ["Library"],
    request: { params: GetLibrarySchema.shape.params },
    responses: createApiResponse(LibrarySchema, "Success"),
});
libraryRouter.get("/:id", validateRequest(GetLibrarySchema), libraryController.getLibrary);

libraryRegistry.registerPath({
    method: "post",
    path: "/library",
    tags: ["Library"],
    request: {
        body: {
        content: {
            "application/json": {
            schema: CreateLibrarySchema
            }
        }
        }
    },
    responses: createApiResponse(LibraryWithPathsSchema, "Success"),
});
libraryRouter.post("/", validateRequest(CreateLibrarySchema), libraryController.createLibrary);
