import {
	BookOpen,
	Check,
	Clock,
	Headphones,
	Heart,
} from "@phosphor-icons/react";
import type { MediaType } from "@/hooks/books/use-book-context-menu-actions";
import { m } from "@/paraglide/messages";

export type ShelfOption = {
	value: string;
	label: () => string;
	icon: typeof Check;
};

export const EBOOK_SHELF_OPTIONS: readonly ShelfOption[] = [
	{ value: "want_to_read", label: m["book.shelf_want_to_read"], icon: Heart },
	{ value: "reading", label: m["book.shelf_reading"], icon: BookOpen },
	{ value: "completed", label: m["book.shelf_completed"], icon: Check },
	{ value: "backlog", label: m["book.shelf_backlog"], icon: Clock },
];

export const AUDIOBOOK_SHELF_OPTIONS: readonly ShelfOption[] = [
	{
		value: "want_to_listen",
		label: m["book.shelf_want_to_listen"],
		icon: Heart,
	},
	{ value: "listening", label: m["book.shelf_listening"], icon: Headphones },
	{ value: "completed", label: m["book.shelf_completed"], icon: Check },
	{ value: "backlog", label: m["book.shelf_backlog"], icon: Clock },
];

export function getShelfOptions(mediaType: MediaType): readonly ShelfOption[] {
	return mediaType === "audiobook"
		? AUDIOBOOK_SHELF_OPTIONS
		: EBOOK_SHELF_OPTIONS;
}
