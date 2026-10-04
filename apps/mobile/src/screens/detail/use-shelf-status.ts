import { useQuery } from "@tanstack/react-query";
import { type ShelfStatus, shelfMeta } from "@/lib/shelves";
import { useApi } from "@/providers/app-provider";

/** API shelf status → the unified bucket the web shows (want/reading/…). */
export const toBucket = (
	status: string | null | undefined,
): ShelfStatus | null => {
	switch (status) {
		case "want_to_read":
		case "want_to_listen":
			return "want";
		case "reading":
		case "listening":
			return "reading";
		case "backlog":
			return "backlog";
		case "completed":
			return "completed";
		default:
			return null;
	}
};

export const fromBucket = (bucket: ShelfStatus, kind: "ebook" | "audiobook") =>
	kind === "audiobook"
		? (
				{
					want: "want_to_listen",
					reading: "listening",
					backlog: "backlog",
					completed: "completed",
				} as const
			)[bucket]
		: (
				{
					want: "want_to_read",
					reading: "reading",
					backlog: "backlog",
					completed: "completed",
				} as const
			)[bucket];

export function useShelfStatus(uuid: string, kind: "ebook" | "audiobook") {
	const { orpc } = useApi();
	const book = useQuery({
		...orpc.bookShelf.get.queryOptions({ input: { bookUuid: uuid } }),
		enabled: kind === "ebook",
	});
	const audio = useQuery({
		...orpc.audiobookShelf.get.queryOptions({ input: { bookUuid: uuid } }),
		enabled: kind === "audiobook",
	});
	const bucket = toBucket(
		(kind === "audiobook" ? audio.data : book.data)?.status,
	);
	if (!bucket) return { bucket: null, label: null, icon: null };
	const meta = shelfMeta(bucket, kind);
	return { bucket, label: meta.label, icon: meta.icon };
}
