import { env } from "@nanahoshi-v2/env/web";
import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "@/utils/orpc";

interface ReaderIframeProps {
	bookUuid: string;
	bookFilename: string;
	existingTtuBookId: number | null;
	onBookLoaded: (ttuBookId: number) => void;
	onExitReader?: () => void;
}

type LoadingState = "downloading" | "sending-to-ttu" | "ready" | "error";

export function ReaderIframe({
	bookUuid,
	bookFilename,
	existingTtuBookId,
	onBookLoaded,
	onExitReader,
}: ReaderIframeProps) {
	const [loadingState, setLoadingState] = useState<LoadingState>(
		existingTtuBookId ? "ready" : "downloading",
	);
	const [ttuBookId, setTtuBookId] = useState<number | null>(existingTtuBookId);
	const [error, setError] = useState<string | null>(null);
	const [mounted, setMounted] = useState(false);
	const connectorRef = useRef<HTMLIFrameElement>(null);
	const hasInitialized = useRef(false);
	const bookFileRef = useRef<File | null>(null);
	const connectorReadyRef = useRef(false);

	// Defer connector iframe to after hydration so onLoad fires reliably
	useEffect(() => {
		setMounted(true);
	}, []);

	const readerUrl = `${env.VITE_SERVER_URL}/reader`;

	// Send book file to the connector iframe
	const sendBookToConnector = useCallback(
		(file: File) => {
			setLoadingState("sending-to-ttu");

			const connector = connectorRef.current;
			if (connector?.contentWindow) {
				connector.contentWindow.postMessage(
					{ book: file, nanahoshiId: bookUuid },
					"*",
				);
			}
		},
		[bookUuid],
	);

	// Listen for messages from TTU reader connector iframe
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

			// Connector signals it's ready to receive books
			if (event.data?.action === "connectorReady") {
				connectorReadyRef.current = true;

				// If book was already downloaded, send it now
				if (bookFileRef.current) {
					sendBookToConnector(bookFileRef.current);
				}
			}
		};

		window.addEventListener("message", handleMessage);
		return () => window.removeEventListener("message", handleMessage);
	}, [onBookLoaded, onExitReader, sendBookToConnector]);

	// Download EPUB and send to TTU connector
	const downloadAndSend = useCallback(async () => {
		if (hasInitialized.current) return;
		hasInitialized.current = true;

		if (existingTtuBookId) {
			const exists = await checkTtuBookExists(existingTtuBookId);
			if (exists) {
				setLoadingState("ready");
				return;
			}
		}

		try {
			setLoadingState("downloading");

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

			// If connector is already ready, send immediately; otherwise it will
			// be sent when the "connectorReady" message arrives
			if (connectorReadyRef.current) {
				sendBookToConnector(file);
			}
		} catch (err) {
			console.error("Failed to initialize book:", err);
			setError(err instanceof Error ? err.message : "Failed to load book");
			setLoadingState("error");
		}
	}, [bookUuid, bookFilename, existingTtuBookId, sendBookToConnector]);

	// Start download on mount
	useEffect(() => {
		downloadAndSend();
	}, [downloadAndSend]);

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
			{/* Hidden connector iframe — deferred to after hydration */}
			{mounted && loadingState !== "ready" && (
				<iframe
					ref={connectorRef}
					src={`${readerUrl}/manage`}
					className="hidden"
					title="TTU Connector"
				/>
			)}

			{/* Loading state */}
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

			{/* Main TTU reader iframe */}
			{loadingState === "ready" && ttuBookId !== null && (
				<iframe
					src={`${readerUrl}/b?id=${ttuBookId}`}
					className="h-full w-full border-0"
					title="TTU Ebook Reader"
					allow="clipboard-write"
				/>
			)}
		</>
	);
}

async function checkTtuBookExists(ttuBookId: number): Promise<boolean> {
	return new Promise((resolve) => {
		try {
			const request = indexedDB.open("books", 6);
			request.onsuccess = () => {
				const db = request.result;
				try {
					const tx = db.transaction("data", "readonly");
					const store = tx.objectStore("data");
					const getReq = store.get(ttuBookId);
					getReq.onsuccess = () => resolve(!!getReq.result);
					getReq.onerror = () => resolve(false);
				} catch {
					resolve(false);
				}
			};
			request.onerror = () => resolve(false);
		} catch {
			resolve(false);
		}
	});
}
