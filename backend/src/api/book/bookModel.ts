import { z } from "zod";

// Modelo base de Book
export const BookSchema = z.object({
    id: z.number().int().nonnegative(),
    filename: z.string().nullable(),
    library_id: z.number().int().nonnegative().nullable(),
    library_path_id: z.number().int().nonnegative().nullable(),
    filesize_kb: z.number().nullable(),
    created_at: z.string(),
    last_modified: z.string().nullable(),
});

export type Book = z.infer<typeof BookSchema>;

// Para GET /book/:id
export const GetBookSchema = z.object({
    params: z.object({
        id: z.number().int().nonnegative(),
    }),
});

// Para POST /book
export const CreateBookSchema = z.object({
    body: z.object({
        filename: z.string(),
        library_id: z.number().int().nonnegative().nullable(),
        library_path_id: z.number().int().nonnegative().nullable(),
        filesize_kb: z.number().nullable().optional(),
        last_modified: z.string().nullable().optional(),
    })
});
export type CreateBookInput = z.infer<typeof CreateBookSchema>["body"];

// Para DELETE /book/:id
export const DeleteBookSchema = z.object({
    params: z.object({
        id: z.number().int().nonnegative(),
    }),
});

export const GetBooksByLibrarySchema = z.object({
    params: z.object({
        libraryId: z.string().transform(Number).pipe(z.number().int().nonnegative()),
    }),
});