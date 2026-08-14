import { ebookSourceFormatForFilename } from "@nanahoshi-v2/api/modules/scanning/supportedExtensions";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import type { getBook } from "@/functions/books/get-book";
import { authClient } from "@/lib/auth-client";
import { shouldSkipReaderPrefetch } from "@/lib/reader/prefetch";

type ReaderLoaderData = Awaited<ReturnType<typeof getBook>>;

/**
 * Preloads the reader route first, then opportunistically starts the ebook.
 * Navigation remains the source of truth: every prefetch failure is silent.
 */
export function useReadListenReaderPrefetch(
	target:
		| {
				ebookUuid: string;
				pairUuid: string;
		  }
		| undefined,
) {
	const router = useRouter();
	const { data: activeOrg } = authClient.useActiveOrganization();
	const pendingRef = useRef<{ key: string; promise: Promise<void> }>();

	const preloadRoute = useCallback(() => {
		if (!target) return Promise.resolve(undefined);
		return router.preloadRoute({
			to: "/reader/$uuid",
			params: { uuid: target.ebookUuid },
			search: { pair: target.pairUuid },
		});
	}, [router, target]);

	const warm = useCallback(() => {
		void preloadRoute().catch(() => {});
	}, [preloadRoute]);

	const prepare = useCallback(() => {
		if (!target) return;
		const key = `${target.ebookUuid}:${target.pairUuid}`;
		if (pendingRef.current?.key === key) return;

		const promise = preloadRoute()
			.then(async (matches) => {
				if (shouldSkipReaderPrefetch()) return;
				const loaderData = matches?.find(
					(match) => match.routeId === "/reader/$uuid",
				)?.loaderData as ReaderLoaderData | undefined;
				const book = loaderData?.book;
				const serverId = loaderData?.switchedOrgId ?? activeOrg?.id;
				if (!book || !serverId) return;

				const sourceFormat = ebookSourceFormatForFilename(book.filename);
				if (!sourceFormat || sourceFormat === "pdf") return;
				const { fetchAndCacheBook, isBookLoadPending } = await import(
					"@/lib/reader/download-book"
				);
				if (isBookLoadPending(target.ebookUuid)) return;
				const { written } = await fetchAndCacheBook(
					target.ebookUuid,
					book.title ?? book.filename,
					book.filesizeKb ? book.filesizeKb * 1024 : undefined,
					serverId,
					{
						cover: book.cover,
						sourceFormat,
					},
				);
				void written;
			})
			.catch(() => {});

		pendingRef.current = { key, promise };
		void promise.finally(() => {
			if (pendingRef.current?.promise === promise) {
				pendingRef.current = undefined;
			}
		});
	}, [activeOrg?.id, preloadRoute, target]);

	return { warm, prepare };
}
