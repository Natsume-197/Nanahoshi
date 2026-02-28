import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "@/utils/orpc";

interface ReaderIframeProps {
	bookUuid: string;
	bookFilename: string;
	onBookLoaded: (ttuBookId: number) => void;
	onExitReader?: () => void;
}

type LoadingState = "downloading" | "sending-to-ttu" | "ready" | "error";

export function ReaderIframe({
	bookUuid,
	bookFilename,
	onBookLoaded,
	onExitReader,
}: ReaderIframeProps) {
	const [loadingState, setLoadingState] = useState<LoadingState>("downloading");
	const [ttuBookId, setTtuBookId] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [mounted, setMounted] = useState(false);
	const connectorRef = useRef<HTMLIFrameElement>(null);
	const hasInitialized = useRef(false);
	const bookFileRef = useRef<File | null>(null);
	const connectorReadyRef = useRef(false);

	// Ensure no malformed "books" DB exists, then allow iframe to mount
	useEffect(() => {
		repairBooksDb().then(() => setMounted(true));
	}, []);

	const sendBookToConnector = useCallback(
		(file: File) => {
			setLoadingState("sending-to-ttu");
			connectorRef.current?.contentWindow?.postMessage(
				{ book: file, nanahoshiId: bookUuid },
				"*",
			);
		},
		[bookUuid],
	);

	// Listen for messages from TTU connector iframe
	useEffect(() => {
		const handleMessage = (event: MessageEvent) => {
			if (event.data?.action === "bookLoaded") {
				const id = event.data.ttuBookId;
				setTtuBookId(id);
				setLoadingState("ready");
				onBookLoaded(id);
			}

			if (event.data?.action === "exitReader") {
				onExitReader?.();
			}

			if (event.data?.action === "connectorReady") {
				connectorReadyRef.current = true;
				if (bookFileRef.current) {
					sendBookToConnector(bookFileRef.current);
				}
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [onBookLoaded, onExitReader, sendBookToConnector]);

	// Download book and send to TTU connector
	useEffect(() => {
		if (hasInitialized.current) return;
		hasInitialized.current = true;

		(async () => {
			try {
				const { url } = await client.files.getSignedDownloadUrl({
					uuid: bookUuid,
				});

				const response = await fetch(url);
				if (!response.ok) throw new Error("Failed to download book");

				const blob = await response.blob();
				const file = new File([blob], bookFilename, {
					type: "application/epub+zip",
				});

				bookFileRef.current = file;

				if (connectorReadyRef.current) {
					sendBookToConnector(file);
				}
			} catch (err) {
				console.error("Failed to initialize book:", err);
				setError(err instanceof Error ? err.message : "Failed to load book");
				setLoadingState("error");
			}
		})();
	}, [bookUuid, bookFilename, sendBookToConnector]);

	if (loadingState === "error") {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="text-center">
					<p className="text-destructive text-lg">Failed to load book</p>
					<p className="mt-1 text-muted-foreground text-sm">{error}</p>
				</div>
			</div>
		);
	}

	return (
		<>
			{mounted && loadingState !== "ready" && (
				<iframe
					ref={connectorRef}
					src="/reader/manage"
					className="hidden"
					title="TTU Connector"
				/>
			)}

			{loadingState !== "ready" && (
				<div className="flex h-full items-center justify-center">
					<div className="text-center">
						<div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
						<p className="text-muted-foreground text-sm">
							{loadingState === "downloading"
								? "Downloading book..."
								: "Loading into reader..."}
						</p>
					</div>
				</div>
			)}

			{loadingState === "ready" && ttuBookId !== null && (
				<iframe
					src={`/reader/b?id=${ttuBookId}`}
					className="h-full w-full border-0"
					title="TTU Ebook Reader"
					allow="clipboard-write"
				/>
			)}
		</>
	);
}

/**
 * Delete the "books" IndexedDB if it exists but has no object stores.
 * Old code could create an empty DB by opening it without an upgrade handler.
 */
function repairBooksDb(): Promise<void> {
	return new Promise((resolve) => {
		try {
			const request = indexedDB.open("books");
			request.onsuccess = () => {
				const db = request.result;
				const needsRepair = db.objectStoreNames.length === 0;
				db.close();
				if (needsRepair) {
					const delReq = indexedDB.deleteDatabase("books");
					delReq.onsuccess = () => resolve();
					delReq.onerror = () => resolve();
				} else {
					resolve();
				}
			};
			request.onerror = () => resolve();
		} catch {
			resolve();
		}
	});
}
