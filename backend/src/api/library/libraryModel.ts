import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { commonValidations } from "@/common/utils/commonValidation";

extendZodWithOpenApi(z);

// Base model library
export const LibrarySchema = z.object({
  id: z.number().int().nonnegative().openapi({ example: 1 }),
  name: z.string().min(1).openapi({ example: "Main Library" }),
  is_cron_watch: z.boolean().nullable().openapi({ example: false }),
  created_at: z.string().datetime().openapi({ example: "2024-05-24T12:00:00Z" }),
});

export type Library = z.infer<typeof LibrarySchema>;

// GET /library
export const GetLibrarySchema = z.object({
  params: z.object({ id: commonValidations.id }),
});

// GET /library/:id
export const CreateLibrarySchema = z.object({
  body: z.object({
    name: z.string().min(1),
    is_cron_watch: z.boolean().optional(),
    paths: z.array(
      z.object({
        path: z.string().min(1),
        is_enabled: z.boolean().optional(),
      })
    ).optional(),
    owner_user_id: z.string().uuid().optional()
  })
});

// POST /library
export const LibraryWithPathsSchema = LibrarySchema.extend({
  paths: z.array(z.object({
    path: z.string(),
    is_enabled: z.boolean(),
  })),
  owner_user_id: z.string().uuid().optional()
});

export type CreateLibraryInput = z.infer<typeof CreateLibrarySchema>["body"];