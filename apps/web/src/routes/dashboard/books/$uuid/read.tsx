import {
	createFileRoute,
	useLoaderData,
	useNavigate,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ReaderIframe } from "@/components/book-reader/reader-iframe";
import { useReaderSync } from "@/components/book-reader/use-reader-sync";

export const Route = createFileRoute("/dashboard/books/$uuid/read")({
	component: ReaderPage,
});

function ReaderPage() {
	const { book } = useLoaderData({ from: "/dashboard/books/$uuid" });
	const [ttuBookId, setTtuBookId] = useState<number | null>(null);
	const navigate = useNavigate();

	useReaderSync({
		bookUuid: book.uuid,
		ttuBookId,
		enabled: ttuBookId !== null,
	});

	const handleBookLoaded = useCallback((id: number) => {
		setTtuBookId(id);
	}, []);

	const handleExitReader = useCallback(() => {
		navigate({ to: "/dashboard/books/$uuid", params: { uuid: book.uuid } });
	}, [navigate, book.uuid]);

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
