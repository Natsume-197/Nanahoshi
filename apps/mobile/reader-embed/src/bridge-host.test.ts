import "@nanahoshi/test-utils/setup-dom";
import { beforeEach, describe, expect, test } from "bun:test";
import { readerApi, readerHost } from "@nanahoshi/reader/host/reader-host";
import {
	encodeRpcPayload,
	hostDeliveryScript,
	READER_BRIDGE_PROTOCOL,
	type ReaderBootConfig,
	type ReaderToHostMessage,
} from "@nanahoshi/reader-bridge";
import { connectNativeHost } from "./bridge-host";

const posted: ReaderToHostMessage[] = [];
window.ReactNativeWebView = {
	postMessage: (raw) => posted.push(JSON.parse(raw) as ReaderToHostMessage),
};
const boot: ReaderBootConfig = {
	protocol: READER_BRIDGE_PROTOCOL,
	screen: {
		kind: "reader",
		uuid: "book-1",
		book: { title: "Book", filename: "book.epub" },
	},
	userId: "user-1",
	serverId: "server-1",
	serverUrl: "https://books.example",
	locale: "es",
	colorScheme: "dark",
	insets: { top: 24, right: 0, bottom: 16, left: 0 },
};
// What react-native-webview's injectJavaScript does with the host's script.
const deliver = (message: Parameters<typeof hostDeliveryScript>[0]) =>
	new Function(hostDeliveryScript(message))();

beforeEach(() => {
	posted.length = 0;
});

describe("the reader page's native host", () => {
	const host = connectNativeHost(boot);

	test("sends every reader API call to the app and resolves with its answer", async () => {
		const progress = readerApi().readingProgress.getProgress({
			bookUuid: "book-1",
		});
		const call = posted.find((m) => m.type === "rpc");
		expect(call).toMatchObject({
			path: ["readingProgress", "getProgress"],
		});

		deliver({
			type: "rpc-result",
			id: (call as { id: number }).id,
			ok: true,
			payload: encodeRpcPayload({ exploredCharCount: 42 }),
		});

		expect((await progress) as unknown).toEqual({ exploredCharCount: 42 });
	});

	test("leaving the reader asks the app to go back to the book", () => {
		host.exitToBook();

		expect(posted).toEqual([
			{ type: "navigate", href: "/dashboard/books/book-1" },
		]);
	});

	test("the reader theme tints the app's status bar", () => {
		readerHost().setChromeColor("oklch(0.21 0 0)");

		expect(posted).toEqual([
			{ type: "chrome-color", color: "oklch(0.21 0 0)" },
		]);
	});

	test("the page pads by the app's safe area, including after rotation", () => {
		const style = document.documentElement.style;
		expect(style.getPropertyValue("--safe-area-top")).toBe("24px");

		deliver({
			type: "insets",
			insets: { top: 0, right: 44, bottom: 0, left: 44 },
		});

		expect(style.getPropertyValue("--safe-area-top")).toBe("0px");
		expect(style.getPropertyValue("--safe-area-left")).toBe("44px");
	});

	test("the app going to the background reads as a hidden tab, and back", () => {
		const seen: string[] = [];
		document.addEventListener("visibilitychange", () =>
			seen.push(document.visibilityState),
		);

		deliver({ type: "visibility", state: "hidden" });
		expect(document.hidden).toBe(true);
		deliver({ type: "visibility", state: "visible" });

		// Back to whatever the WebView itself reports (jsdom says "prerender").
		expect(seen[0]).toBe("hidden");
		expect(seen[1]).not.toBe("hidden");
		expect(document.hidden).toBe(false);
	});

	test("the app keeps book files, so the reader does not duplicate them", () => {
		expect(readerHost().cacheBookFiles).toBe(false);
	});

	test("a page inside a native list tells the app its height as it changes", () => {
		let notify = () => {};
		const original = globalThis.ResizeObserver;
		globalThis.ResizeObserver = class {
			constructor(callback: () => void) {
				notify = callback;
			}
			observe() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver;
		const element = document.createElement("div");
		let height = 900.4;
		element.getBoundingClientRect = () => ({ height }) as DOMRect;

		const stop = host.reportHeight(element);
		notify();
		notify();
		height = 1200;
		notify();
		stop?.();
		globalThis.ResizeObserver = original;

		expect(posted.filter((m) => m.type === "content-height")).toEqual([
			{ type: "content-height", height: 901 },
			{ type: "content-height", height: 1200 },
		]);
	});
});
