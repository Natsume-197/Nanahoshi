export const ACTIVITY_TYPES = {
	STARTED_READING: "started_reading",
	COMPLETED_READING: "completed_reading",
	LIKED_BOOK: "liked_book",
} as const;

export type ActivityType = (typeof ACTIVITY_TYPES)[keyof typeof ACTIVITY_TYPES];

export const READING_STATUSES = {
	UNREAD: "unread",
	READING: "reading",
	COMPLETED: "completed",
} as const;

export type ReadingStatus =
	(typeof READING_STATUSES)[keyof typeof READING_STATUSES];

export const LIST_STATUSES = {
	WANT_TO_READ: "want_to_read",
	BACKLOG: "backlog",
	READING: "reading",
	COMPLETED: "completed",
} as const;

export type ListStatus = (typeof LIST_STATUSES)[keyof typeof LIST_STATUSES];
