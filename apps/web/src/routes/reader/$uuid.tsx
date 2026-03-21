import { ORPCError } from "@orpc/client";
import {
	createFileRoute,
	notFound,
	redirect,
	useLoaderData,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import { useReaderSync } from "@/components/book-reader/use-reader-sync";
import { CharacterCounter } from "@/components/reader/character-counter";
import { KeymapManager } from "@/components/reader/keymap-manager";
import { ReaderContent } from "@/components/reader/reader-content";
import { ReaderNavbar } from "@/components/reader/reader-navbar";
import { ReaderSettingsPanel } from "@/components/reader/reader-settings-panel";
import { ReaderTocPanel } from "@/components/reader/reader-toc-panel";
import { ReaderProvider, useReaderState } from "@/context/reader-context";
import { getBook } from "@/functions/books/get-book";
import { useMountEffect } from "@/hooks/use-mount-effect";
import { useOnUnmount } from "@/hooks/use-on-unmount";
import { ReaderSettingsProvider } from "@/hooks/use-reader-settings";
import { EpubBook, getBaseName } from "@/lib/epub";
import { readerDb } from "@/lib/reader-db";
import { client } from "@/utils/orpc";

export const Route = createFileRoute("/reader/$uuid")({
	component: ReaderPage,
	beforeLoad: ({ context }) => {
		if (!context.session) {
			throw redirect({ to: "/login" });
		}
		return { session: context.session };
	},
	loader: async ({ params }) => {
		try {
			const book = await getBook({ data: params.uuid });
			return { book };
		} catch (error) {
			if (error instanceof ORPCError && error.status === 404) {
				throw notFound();
			}
			throw error;
		}
	},
});

type LoadingState = "loading" | "downloading" | "parsing" | "ready" | "error";

function ReaderPage() {
	const { book: bookData } = useLoaderData({
		from: "/reader/$uuid",
	});
	const navigate = useNavigate();
	const router = useRouter();
	const hasFlushedProgressRef = useRef(false);
	const hasMarkedAsReadingRef = useRef(false);

	const [loadingState, setLoadingState] = useState<LoadingState>("loading");
	const [downloadProgress, setDownloadProgress] = useState(0);
	const [error, setError] = useState<string | null>(null);
	const [epubBook, setEpubBook] = useState<EpubBook | null>(null);
	const [imageMap, setImageMap] = useState<Map<string, string>>(new Map());

	const bookRef = useRef<EpubBook | null>(null);
	bookRef.current = epubBook;

	const getCharCounts = useCallback(
		() => ({
			exploredCharCount: bookRef.current?.currChars ?? 0,
			bookCharCount: bookRef.current?.totalChars ?? 0,
		}),
		[],
	);

	const { syncNow } = useReaderSync({
		bookUuid: bookData.uuid,
		enabled: epubBook !== null,
		getCharCounts,
	});

	const markAsReading = useCallback(async () => {
		if (hasMarkedAsReadingRef.current) return;
		hasMarkedAsReadingRef.current = true;

		await client.readingProgress.saveProgress({
			bookUuid: bookData.uuid,
			status: "reading",
		});
	}, [bookData.uuid]);

	const flushReaderProgress = useCallback(async () => {
		if (hasFlushedProgressRef.current) return;
		hasFlushedProgressRef.current = true;

		try {
			if (epubBook === null) {
				await markAsReading();
			} else {
				await syncNow();
			}
		} finally {
			await router.invalidate();
		}
	}, [markAsReading, router, syncNow, epubBook]);

	const handleExitReader = useCallback(() => {
		void flushReaderProgress().finally(() => {
			navigate({
				to: "/dashboard/books/$uuid",
				params: { uuid: bookData.uuid },
			});
		});
	}, [flushReaderProgress, navigate, bookData.uuid]);

	useOnUnmount(() => {
		void flushReaderProgress();
		// Cleanup blob URLs
		bookRef.current?.deinit();
	});

	// Load EPUB on mount
	useMountEffect(() => {
		loadBook();

		async function loadBook() {
			try {
				const bookVersion = `${bookData.lastModified ?? bookData.createdAt}:${bookData.filesizeKb ?? "unknown"}:${bookData.filename}`;

				// Check local cache first
				setLoadingState("loading");
				const cached = await readerDb.getBookByUniqueId(
					`${bookData.uuid}:${bookVersion}`,
				);

				let book: EpubBook;

				if (cached) {
					book = EpubBook.fromReaderSourceRecord(cached);
				} else {
					// Download the EPUB
					setLoadingState("downloading");
					const { url } = await client.files.getSignedDownloadUrl({
						uuid: bookData.uuid,
					});

					const response = await fetch(url, {
						credentials: "include",
					});
					if (!response.ok) throw new Error("Failed to download book");

					const contentLength = Number(
						response.headers.get("Content-Length") ?? 0,
					);
					if (!response.body) throw new Error("No response body");
					const reader = response.body.getReader();
					const chunks: Uint8Array[] = [];
					let received = 0;

					for (;;) {
						const { done, value } = await reader.read();
						if (done) break;
						chunks.push(value);
						received += value.length;
						if (contentLength > 0) {
							setDownloadProgress(Math.round((received / contentLength) * 100));
						}
					}

					const blob = new Blob(chunks, {
						type: "application/epub+zip",
					});
					const file = new File(
						[blob],
						bookData.readerFilename ?? bookData.filename,
						{ type: "application/epub+zip" },
					);

					// Parse the EPUB
					setLoadingState("parsing");
					book = await EpubBook.fromFile(file);
					// Override uniqueId to include version for cache invalidation
					book.uniqueId = `${bookData.uuid}:${bookVersion}`;
					await book.save();
				}

				// Build image map
				const map = new Map<string, string>();
				for (const img of book.images) {
					if (img.url) {
						const base = getBaseName(img.filename);
						map.set(base, img.url);
					}
				}

				setImageMap(map);
				setEpubBook(book);
				setLoadingState("ready");

				// Mark as reading
				void markAsReading().finally(() => {
					void router.invalidate();
				});
			} catch (err) {
				console.error("Failed to load EPUB:", err);
				setError(err instanceof Error ? err.message : "Failed to load book");
				setLoadingState("error");
			}
		}
	});

	if (loadingState === "error") {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<p className="text-destructive text-lg">Failed to load book</p>
					<p className="mt-1 text-muted-foreground text-sm">{error}</p>
					<button
						type="button"
						onClick={() =>
							navigate({
								to: "/dashboard/books/$uuid",
								params: { uuid: bookData.uuid },
							})
						}
						className="mt-4 rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm"
					>
						Go back
					</button>
				</div>
			</div>
		);
	}

	if (loadingState !== "ready" || !epubBook) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="text-center">
					<div className="mx-auto mb-4 size-8 animate-spin rounded-full border-2 border-muted border-t-foreground" />
					<p className="text-muted-foreground text-sm">
						{loadingState === "loading"
							? "Checking cache..."
							: loadingState === "downloading"
								? "Downloading book..."
								: "Parsing EPUB..."}
					</p>
					{loadingState === "downloading" && (
						<div className="mx-auto mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-muted">
							<div
								className="h-full rounded-full bg-foreground transition-all duration-300 ease-out"
								style={{ width: `${downloadProgress}%` }}
							/>
						</div>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="h-screen">
			<ReaderSettingsProvider>
				<ReaderProvider book={epubBook}>
					<ReaderNavbar onExit={handleExitReader} />
					<ReaderTocPanel />
					<ReaderSettingsPanel />
					<CharacterCounter />
					<KeymapManager />
					<ReaderContentKeyed imageMap={imageMap} />
				</ReaderProvider>
			</ReaderSettingsProvider>
		</div>
	);
}

function ReaderContentKeyed({ imageMap }: { imageMap: Map<string, string> }) {
	const { settingsVersion } = useReaderState();
	return <ReaderContent key={settingsVersion} imageMap={imageMap} />;
}
