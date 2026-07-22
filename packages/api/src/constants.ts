export const READING_STATUSES = {
	UNREAD: "unread",
	READING: "reading",
	COMPLETED: "completed",
} as const;

export type ReadingStatus =
	(typeof READING_STATUSES)[keyof typeof READING_STATUSES];

export const LISTENING_STATUSES = {
	UNSTARTED: "unstarted",
	LISTENING: "listening",
	COMPLETED: "completed",
} as const;

export type ListeningStatus =
	(typeof LISTENING_STATUSES)[keyof typeof LISTENING_STATUSES];

export const LIST_STATUSES = {
	WANT_TO_READ: "want_to_read",
	BACKLOG: "backlog",
	READING: "reading",
	COMPLETED: "completed",
} as const;

export type ListStatus = (typeof LIST_STATUSES)[keyof typeof LIST_STATUSES];

export const AUDIOBOOK_SHELF_STATUSES = {
	WANT_TO_LISTEN: "want_to_listen",
	BACKLOG: "backlog",
	LISTENING: "listening",
	COMPLETED: "completed",
} as const;

export type AudiobookShelfStatus =
	(typeof AUDIOBOOK_SHELF_STATUSES)[keyof typeof AUDIOBOOK_SHELF_STATUSES];
