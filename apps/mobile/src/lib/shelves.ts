import { type IconName, icons } from "@/components/icon";
import { t } from "./i18n";

export type ShelfStatus = "want" | "reading" | "backlog" | "completed";
export type ShelfFormat = "ebook" | "audiobook" | "all";

/** The web's shelfBucketMeta: label and icon per reading status and format. */
const META: Record<
	ShelfFormat,
	Record<ShelfStatus, { icon: IconName; key: string }>
> = {
	ebook: {
		want: { icon: icons.heart, key: "book.shelf_want_to_read" },
		reading: { icon: icons.book, key: "book.shelf_reading" },
		backlog: { icon: icons.clock, key: "book.shelf_backlog" },
		completed: { icon: icons.check, key: "book.shelf_completed" },
	},
	audiobook: {
		want: { icon: icons.heart, key: "book.shelf_want_to_listen" },
		reading: { icon: icons.headphones, key: "book.shelf_listening" },
		backlog: { icon: icons.clock, key: "book.shelf_backlog" },
		completed: { icon: icons.check, key: "book.shelf_completed" },
	},
	all: {
		want: { icon: icons.bookmark, key: "book.shelf_want_to_start" },
		reading: { icon: icons.play, key: "book.shelf_in_progress" },
		backlog: { icon: icons.clock, key: "book.shelf_backlog" },
		completed: { icon: icons.check, key: "book.shelf_completed" },
	},
};

export function shelfMeta(status: ShelfStatus, format: ShelfFormat) {
	const meta = META[format][status];
	return { icon: meta.icon, label: t(meta.key) };
}

export const isShelfStatus = (value: unknown): value is ShelfStatus =>
	value === "want" ||
	value === "reading" ||
	value === "backlog" ||
	value === "completed";
