import { dismissTopOverlay } from "@nanahoshi/reader/interaction/back-dismiss";
import "./styles.css";
import { readerQueryUtils } from "@nanahoshi/reader/host/reader-host";
import { m } from "@nanahoshi/reader/i18n/messages";
import { findReadyReadListenPairing } from "@nanahoshi/reader/read-listen/pairing";
import { useReadListenMode } from "@nanahoshi/reader/read-listen/use-read-listen-mode";
import {
	ReaderScreen,
	type ReaderScreenBook,
} from "@nanahoshi/reader/reader-screen";
import { ReadingHistory } from "@nanahoshi/reader/sessions/reading-history";
import type { StatsView } from "@nanahoshi/reader/sessions/stats-model";
import { StatsPage } from "@nanahoshi/reader/stats/stats-page";
import {
	READER_BOOT_GLOBAL,
	READER_BRIDGE_PROTOCOL,
	type ReaderBootConfig,
	type ReaderBootScreen,
} from "@nanahoshi/reader-bridge";
import { Toaster } from "@nanahoshi/ui/components/sonner";
import { bindUiLabels } from "@nanahoshi/ui/lib/labels";
import {
	QueryClient,
	QueryClientProvider,
	useQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { connectNativeHost } from "./bridge-host";

type NativeHost = ReturnType<typeof connectNativeHost>;

function EmbedReader({
	uuid,
	book,
	userId,
	serverId,
	initialPairUuid,
	host,
}: {
	uuid: string;
	book: ReaderScreenBook;
	userId: string;
	serverId: string;
	initialPairUuid: string | undefined;
	host: NativeHost;
}) {
	// The web keeps the mode in the URL (?pair=); here the screen holds it.
	const [pairUuid, setPairUuid] = useState(initialPairUuid);
	const pairings = useQuery(
		readerQueryUtils().readListen.getPairings.queryOptions({
			input: { publicationUuid: uuid },
		}),
	);
	const readyPairing = findReadyReadListenPairing(pairings.data?.pairings);
	const isPdf = book.filename?.toLowerCase().endsWith(".pdf") ?? false;
	const readListen = useReadListenMode({
		uuid,
		pairUuid,
		readyPairUuid: readyPairing?.id,
		available: Boolean(!isPdf && (pairUuid || readyPairing)),
		stopAudio: host.stopAudio,
		enterMode: setPairUuid,
		leaveMode: () => setPairUuid(undefined),
		// Opened in Read & Listen from the audiobook: go back there, as the web
		// does; otherwise just return to plain reading.
		exitReadListen: () =>
			initialPairUuid ? host.goBack() : setPairUuid(undefined),
	});
	return (
		<ReaderScreen
			book={book}
			uuid={uuid}
			userId={userId}
			serverId={serverId}
			onExit={() => {
				readListen.clearEntry();
				host.exitToBook();
			}}
			onBookCompleted={host.exitToBook}
			readListen={readListen}
		/>
	);
}

function StatsScreen({
	initialView,
	fitContent,
	host,
}: {
	initialView: StatsView;
	fitContent: boolean;
	host: NativeHost;
}) {
	const [view, setView] = useState(initialView);
	return (
		<div ref={fitContent ? host.reportHeight : undefined}>
			<StatsPage
				// The app's header already names the page.
				showTitle={false}
				className={
					fitContent
						? "px-4 pb-6"
						: "px-4 pt-4 pb-[calc(1.5rem+var(--safe-area-bottom))]"
				}
				view={view}
				onViewChange={setView}
			/>
		</div>
	);
}

const root = createRoot(document.getElementById("root") as HTMLElement);

// Android may inject the host's config after the page's scripts have run.
const BOOT_WAIT_MS = 5000;

/** Starts once the host's config is there, whenever it arrives. */
function whenBooted(start: (boot: ReaderBootConfig) => void) {
	const scope = window as unknown as Record<string, unknown>;
	const injected = scope[READER_BOOT_GLOBAL] as ReaderBootConfig | undefined;
	if (injected) return start(injected);
	let boot: ReaderBootConfig | undefined;
	Object.defineProperty(scope, READER_BOOT_GLOBAL, {
		configurable: true,
		get: () => boot,
		set: (value: ReaderBootConfig) => {
			if (boot) return;
			boot = value;
			start(value);
		},
	});
	setTimeout(() => {
		if (!boot)
			root.render(<p>Nanahoshi reader: the app did not say what to show.</p>);
	}, BOOT_WAIT_MS);
}

function Screen({
	screen,
	serverId,
	config,
	host,
}: {
	screen: ReaderBootScreen;
	serverId: string;
	config: ReaderBootConfig;
	host: NativeHost;
}) {
	// Each opened screen starts from an empty cache, as a fresh page would.
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
			}),
	);
	return (
		<QueryClientProvider client={queryClient}>
			{screen.kind === "reader" ? (
				<EmbedReader
					uuid={screen.uuid}
					book={screen.book}
					userId={config.userId}
					serverId={serverId}
					initialPairUuid={screen.readListenPairUuid}
					host={host}
				/>
			) : screen.kind === "history" ? (
				<div className="px-4 pt-4 pb-[calc(1.5rem+var(--safe-area-bottom))]">
					<ReadingHistory
						bookUuid={screen.bookUuid}
						medium={screen.medium}
						amountChars={screen.amountChars}
						durationSeconds={screen.durationSeconds}
						chapters={screen.chapters}
					/>
				</div>
			) : (
				<StatsScreen
					initialView={screen.view}
					fitContent={screen.fitContent ?? false}
					host={host}
				/>
			)}
			<Toaster position="top-center" />
		</QueryClientProvider>
	);
}

whenBooted((boot) => {
	if (boot.protocol !== READER_BRIDGE_PROTOCOL) {
		root.render(<p>Nanahoshi reader: the app and this page do not match.</p>);
		return;
	}
	const config = boot;
	const host = connectNativeHost(config);
	let opened = 0;
	const show = (screen: ReaderBootScreen, serverId: string) => {
		opened += 1;
		if (screen.kind !== "reader" && screen.background)
			document.documentElement.style.setProperty(
				"--background",
				screen.background,
			);
		root.render(
			<Screen
				key={opened}
				screen={screen}
				serverId={serverId}
				config={config}
				host={host}
			/>,
		);
	};
	// Closing empties the page but keeps it loaded for the next book.
	host.onClose(() => root.render(null));
	host.onOpen(show);
	host.onBack(dismissTopOverlay);
	bindUiLabels({ close: () => m["common.close"]() });
	window.addEventListener("error", (event) => host.reportError(event.message));
	if (config.screen) show(config.screen, config.serverId ?? "");
	host.ready();
});
