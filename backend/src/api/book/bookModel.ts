import { z } from "zod";

// Base model book
export const BookSchema = z.object({
    id: z.number().int().nonnegative(),
    filename: z.string(),
    library_id: z.number().int().nonnegative().nullable(),
    library_path_id: z.number().int().nonnegative().nullable(),
    filesize_kb: z.number().nullable(),
    created_at: z.string(),
    last_modified: z.string().nullable(),
    filehash: z.string().nullable(),
    relative_path: z.string().nullable(),
});

export type Book = z.infer<typeof BookSchema>;

// GET /book/:id
export const GetBookSchema = z.object({
    params: z.object({
        id: z.number().int().nonnegative(),
    }),
});

// POST /book
export const CreateBookSchema = z.object({
    body: z.object({
        filename: z.string(),
        library_id: z.number().int().nonnegative().nullable(),
        filehash: z.string().nullable(),
        relative_path: z.string().nullable(),
        library_path_id: z.number().int().nonnegative().nullable(),
        filesize_kb: z.number().nullable().optional(),
        last_modified: z.string().nullable().optional(),
    })
});
export type CreateBookInput = z.infer<typeof CreateBookSchema>["body"];

// DELETE /book/:id
export const DeleteBookSchema = z.object({
    params: z.object({
        id: z.number().int().nonnegative(),
    }),
});

// GET /book/library/:libraryId
export const GetBooksByLibrarySchema = z.object({
    params: z.object({
        libraryId: z.string().transform(Number).pipe(z.number().int().nonnegative()),
    }),
});