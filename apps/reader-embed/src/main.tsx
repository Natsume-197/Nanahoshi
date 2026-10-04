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

function StatsScreen({ initialView }: { initialView: StatsView }) {
	const [view, setView] = useState(initialView);
	return (
		<StatsPage
			// The app's header already names the page.
			showTitle={false}
			className="px-4 pt-4 pb-[calc(1.5rem+var(--safe-area-bottom))]"
			view={view}
			onViewChange={setView}
		/>
	);
}

const boot = (window as unknown as Record<string, unknown>)[
	READER_BOOT_GLOBAL
] as ReaderBootConfig | undefined;
const root = createRoot(document.getElementById("root") as HTMLElement);

if (boot?.protocol !== READER_BRIDGE_PROTOCOL) {
	root.render(<p>Nanahoshi reader: the app did not say what to show.</p>);
} else {
	const host = connectNativeHost(boot);
	bindUiLabels({ close: () => m["common.close"]() });
	window.addEventListener("error", (event) => host.reportError(event.message));
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
	});

	root.render(
		<QueryClientProvider client={queryClient}>
			{boot.screen.kind === "reader" ? (
				<EmbedReader
					uuid={boot.screen.uuid}
					book={boot.screen.book}
					userId={boot.userId}
					serverId={boot.serverId}
					initialPairUuid={boot.screen.readListenPairUuid}
					host={host}
				/>
			) : boot.screen.kind === "history" ? (
				<div className="px-4 pt-4 pb-[calc(1.5rem+var(--safe-area-bottom))]">
					<ReadingHistory
						bookUuid={boot.screen.bookUuid}
						medium={boot.screen.medium}
						amountChars={boot.screen.amountChars}
						durationSeconds={boot.screen.durationSeconds}
						chapters={boot.screen.chapters}
					/>
				</div>
			) : (
				<StatsScreen initialView={boot.screen.view} />
			)}
			<Toaster position="top-center" />
		</QueryClientProvider>,
	);
	if (boot.screen.kind !== "reader" && boot.screen.background) {
		document.documentElement.style.setProperty(
			"--background",
			boot.screen.background,
		);
	}
	host.ready();
}
