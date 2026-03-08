import {
	createFileRoute,
	useLoaderData,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReaderIframe } from "@/components/book-reader/reader-iframe";
import { useReaderSync } from "@/components/book-reader/use-reader-sync";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/dashboard/books/$uuid/read")({
	component: ReaderPage,
});

function ReaderPage() {
	const { book } = useLoaderData({ from: "/dashboard/books/$uuid" });
	const [ttuBookId, setTtuBookId] = useState<number | null>(null);
	const navigate = useNavigate();
	const router = useRouter();
	const hasFlushedProgressRef = useRef(false);
	const hasMarkedAsReadingRef = useRef(false);

	const { syncNow } = useReaderSync({
		bookUuid: book.uuid,
		ttuBookId,
		enabled: ttuBookId !== null,
	});

	const markAsReading = useCallback(
		async (nextTtuBookId?: number) => {
			if (hasMarkedAsReadingRef.current) return;
			hasMarkedAsReadingRef.current = true;

			await client.readingProgress.saveProgress({
				bookUuid: book.uuid,
				...(nextTtuBookId !== undefined ? { ttuBookId: nextTtuBookId } : {}),
				status: "reading",
			});
		},
		[book.uuid],
	);

	const handleBookLoaded = useCallback(
		(id: number) => {
			setTtuBookId(id);
			void markAsReading(id).finally(() => {
				void router.invalidate();
			});
		},
		[markAsReading, router],
	);

	const flushReaderProgress = useCallback(async () => {
		if (hasFlushedProgressRef.current) return;
		hasFlushedProgressRef.current = true;

		try {
			if (ttuBookId === null) {
				await markAsReading();
			} else {
				await syncNow();
			}
		} finally {
			await router.invalidate();
		}
	}, [markAsReading, router, syncNow, ttuBookId]);

	useEffect(() => {
		return () => {
			void flushReaderProgress();
		};
	}, [flushReaderProgress]);

	const handleExitReader = useCallback(() => {
		void flushReaderProgress().finally(() => {
			navigate({ to: "/dashboard/books/$uuid", params: { uuid: book.uuid } });
		});
	}, [flushReaderProgress, navigate, book.uuid]);

	return (
		<div className="h-screen">
			<ReaderIframe
				bookUuid={book.uuid}
				bookFilename={book.filename}
				onBookLoaded={handleBookLoaded}
				onExitReader={handleExitReader}
			/>
		</div>
	);
}
