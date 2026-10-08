import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRef } from "react";
import { Dimensions } from "react-native";
import { useApi, useConnection } from "@/providers/app-provider";
import type { Api } from "./api";
import { coverUrl, HERO_BACKDROP_WIDTH, heroCoverWidth } from "./covers";
import type { MediaKind } from "./routes";

type Orpc = Api["orpc"];

/** What a book's detail page needs before it can draw its hero. */
export function bookDetailQueries(orpc: Orpc, uuid: string) {
	return {
		detail: orpc.books.getBookWithMetadata.queryOptions({ input: { uuid } }),
		progress: orpc.readingProgress.getProgress.queryOptions({
			input: { bookUuid: uuid },
		}),
	};
}

/** What an audiobook's detail page needs before it can draw its hero. */
export function audiobookDetailQueries(orpc: Orpc, uuid: string) {
	return {
		detail: orpc.audiobooks.getDetails.queryOptions({ input: { uuid } }),
		progress: orpc.listeningProgress.getProgress.queryOptions({
			input: { bookUuid: uuid },
		}),
	};
}

/**
 * Starts loading a title's detail page the moment a finger lands on it, so
 * by the time the push animation ends the page is usually already filled:
 * its queries (already-fresh ones are skipped) and its hero-sized cover.
 */
export function usePrefetchTitle() {
	const { orpc } = useApi();
	const { serverUrl } = useConnection();
	const queryClient = useQueryClient();
	return (kind: MediaKind, uuid: string, cover?: string | null) => {
		if (kind === "audiobook") {
			const queries = audiobookDetailQueries(orpc, uuid);
			void queryClient.prefetchQuery(queries.detail);
			void queryClient.prefetchQuery(queries.progress);
		} else {
			const queries = bookDetailQueries(orpc, uuid);
			void queryClient.prefetchQuery(queries.detail);
			void queryClient.prefetchQuery(queries.progress);
		}
		const screen = Dimensions.get("window").width;
		const shape = kind === "audiobook" ? "audio" : "book";
		const images = [
			coverUrl(serverUrl, cover, heroCoverWidth(screen, shape)),
			coverUrl(serverUrl, cover, HERO_BACKDROP_WIDTH),
		].filter((uri): uri is string => uri !== null);
		if (images.length > 0) void Image.prefetch(images);
	};
}

// A finger resting this long means a tap is coming; a scroll's touch lifts
// (press out) sooner, and no longer loads a page nobody opens.
const DWELL_MS = 120;

/**
 * Press handlers that prefetch a title: after a short dwell, or at the tap
 * itself (a quick tap lifts before the dwell). Spread `onPressIn` and
 * `onPressOut`; call `onPress` before navigating.
 */
export function usePrefetchOnPress() {
	const prefetch = usePrefetchTitle();
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cancel = () => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = null;
	};
	return (kind: MediaKind, uuid: string, cover?: string | null) => ({
		onPressIn: () => {
			cancel();
			timer.current = setTimeout(() => {
				timer.current = null;
				prefetch(kind, uuid, cover);
			}, DWELL_MS);
		},
		onPressOut: cancel,
		onPress: () => {
			cancel();
			prefetch(kind, uuid, cover);
		},
	});
}
