import { Link, createFileRoute, useLoaderData } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useState } from "react";
import { ReaderIframe } from "@/components/book-reader/reader-iframe";
import { useReaderSync } from "@/components/book-reader/use-reader-sync";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/books/$uuid/read")({
	component: ReaderPage,
});

function ReaderPage() {
	const { book } = useLoaderData({ from: "/dashboard/books/$uuid" });
	const [ttuBookId, setTtuBookId] = useState<number | null>(null);

	useReaderSync({
		bookUuid: book.uuid,
		ttuBookId,
		enabled: ttuBookId !== null,
	});

	const handleBookLoaded = useCallback((id: number) => {
		setTtuBookId(id);
	}, []);

	return (
		<div className="relative h-screen">
			<Link to="/dashboard/books/$uuid" params={{ uuid: book.uuid }}>
				<Button
					asChild
					variant="ghost"
					size="icon"
					className="absolute top-3 left-3 z-10 rounded-full bg-background/80 shadow-sm backdrop-blur hover:bg-background"
				>
					<span>
					<ArrowLeft className="size-5" />
					</span>
				</Button>
			</Link>
			<ReaderIframe
				bookUuid={book.uuid}
				bookFilename={book.filename}
				existingTtuBookId={null}
				onBookLoaded={handleBookLoaded}
			/>
		</div>
	);
}
