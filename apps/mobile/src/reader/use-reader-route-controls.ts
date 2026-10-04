import { type Href, router, useNavigation } from "expo-router";
import { type RefObject, useRef } from "react";
import { BackHandler } from "react-native";
import { useMountEffect } from "@/hooks/use-mount-effect";
import type { ReaderWebViewHandle } from "./embed-webview";

/** Android's Back first closes the reader's open panel. Leaving a WebView of
 * the screen's own waits for the page's last saves (destroying it skips its
 * unmount); the pooled page outlives the screen and saves after it has gone.
 * Returns how to leave the screen, optionally for another page of the app. */
export function useReaderRouteControls(
	handle: RefObject<ReaderWebViewHandle | null>,
	pooled: () => boolean,
) {
	const navigation = useNavigation();
	// Opened only once the reader is gone: the reader sits above the tabs, so a
	// page pushed while it is still there would open hidden underneath.
	const next = useRef<Href | null>(null);

	useMountEffect(() => {
		const subscription = BackHandler.addEventListener(
			"hardwareBackPress",
			() => {
				const reader = handle.current;
				// A screen stacked on the reader handles its own Back.
				if (!reader || !navigation.isFocused()) return false;
				reader.back(() => navigation.goBack());
				return true;
			},
		);
		return () => subscription.remove();
	});

	useMountEffect(() => {
		let leaving = false;
		let left = false;
		return navigation.addListener("beforeRemove", (event) => {
			const reader = handle.current;
			if (left || !reader || pooled()) return;
			event.preventDefault();
			if (leaving) return;
			leaving = true;
			void reader.close().then(() => {
				left = true;
				navigation.dispatch(event.data.action);
				const target = next.current;
				next.current = null;
				if (target) router.push(target);
			});
		});
	});

	return (target?: Href) => {
		if (pooled()) {
			navigation.goBack();
			// After the reader has left the stack, so the page opens on top.
			if (target) requestAnimationFrame(() => router.push(target));
			return;
		}
		next.current = target ?? null;
		navigation.goBack();
	};
}
