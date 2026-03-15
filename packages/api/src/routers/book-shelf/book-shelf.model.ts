import type { userBookShelf } from "@nanahoshi-v2/db/schema/general";
import { z } from "zod";
import { LIST_STATUSES } from "../../constants";

export type UserBookShelf = typeof userBookShelf.$inferSelect;
export type CreateUserBookShelf = typeof userBookShelf.$inferInsert;

export const LIST_STATUS_VALUES = [
	LIST_STATUSES.WANT_TO_READ,
	LIST_STATUSES.BACKLOG,
	LIST_STATUSES.READING,
	LIST_STATUSES.COMPLETED,
] as const;

export const SetBookShelfInput = z.object({
	bookUuid: z.string(),
	status: z.enum(LIST_STATUS_VALUES),
});

export const GetBookShelfInput = z.object({
	bookUuid: z.string(),
});

export const RemoveBookShelfInput = z.object({
	bookUuid: z.string(),
});

export const ListBookShelfInput = z.object({
	status: z.enum(LIST_STATUS_VALUES).optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const GetPublicShelfInput = z.object({
	username: z.string(),
	status: z.enum(LIST_STATUS_VALUES).optional(),
	limit: z.number().int().min(1).max(100).default(50),
});

export const GetPublicShelfPaginatedInput = z.object({
	username: z.string(),
	status: z.enum(LIST_STATUS_VALUES).optional(),
	limit: z.number().int().min(1).max(100).default(40),
	offset: z.number().int().min(0).default(0),
});
