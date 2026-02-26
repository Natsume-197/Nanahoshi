import type { book } from "@nanahoshi-v2/db/schema/general";
import { z } from "zod";
import { MetadataInfoSchema } from "./metadata/book.metadata.model";

// ─── Base Schemas ────────────────────────────────────────
const BasicInfoSchema = z.object({
	id: z.number().int().nonnegative(),
	filename: z.string(),
	filesizeKb: z.number().nullable().optional(),
	uuid: z.string(),
	createdAt: z.string(),
	lastModified: z.string().nullable().optional(),
});

const MediaInfoSchema = z.object({
	cover: z.string().nullable().optional(),
	downloadLink: z.string().nullable().optional(),
	color: z.string().nullable().optional(),
});

// ─── Book Schema (Book = Basic + Media + Metadata) ───────
export const BookSchema = BasicInfoSchema.extend(MediaInfoSchema.shape).extend(
	MetadataInfoSchema.shape,
);

// ─── Types ──────────────────────────────────────────────
export type BookComplete = z.infer<typeof BookSchema>;

// Database-related types
export type Book = typeof book.$inferSelect;
export type CreateBookInput = typeof book.$inferInsert;
