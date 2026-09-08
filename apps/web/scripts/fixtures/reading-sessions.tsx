import type { SessionUpload } from "@nanahoshi-v2/api/routers/reading-sessions/reading-sessions.model";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { summarizeReading } from "../../../../packages/api/src/routers/reading-sessions/reading-statistics";
import { ReaderHeader } from "../../src/features/reader/ui/chrome/reader-header";
import { ReadingHistory } from "../../src/features/reading-sessions/reading-history";
import { ReadingSessionControl } from "../../src/features/reading-sessions/reading-session-control";
import { useReadingTracker } from "../../src/features/reading-sessions/use-reading-tracker";
import { setLocale } from "../../src/paraglide/runtime";
import { orpc } from "../../src/utils/orpc";
import "../../src/index.css";

setLocale("es", { reload: false });
const qc = new QueryClient({
	defaultOptions: {
		queries: { staleTime: Number.POSITIVE_INFINITY, retry: false },
	},
});
const scenario = new URLSearchParams(location.search).get("history");
const now = Date.now() - (scenario === "old" ? 60 * 86400000 : 0);
const runId = crypto.randomUUID();
// A reproducible reading diary: commute sessions, longer evenings, skipped
// days, a manual entry with no positions, and a short reread of an earlier passage.
const diary: [
	number,
	number,
	number,
	number,
	number | null,
	number | null,
	string,
][] = [
	[27, 21, 12, 1164, 0.03, 0.054, "Desktop"],
	[26, 7, 38, 637, 0.054, 0.067, "Mobile"],
	[24, 8, 5, 843, 0.067, 0.081, "Mobile"],
	[24, 21, 17, 2462, 0.081, 0.128, "Desktop"],
	[23, 22, 8, 1328, 0.128, 0.15, "Desktop"],
	[21, 15, 42, 3216, 0.15, 0.21, "Tablet"],
	[20, 20, 56, 1941, 0.21, 0.245, "Desktop"],
	[18, 7, 51, 492, 0.245, 0.252, "Mobile"],
	[17, 22, 3, 1687, 0.252, 0.281, "Desktop"],
	[15, 8, 12, 725, 0.281, 0.268, "Mobile"],
	[15, 20, 34, 2143, 0.268, 0.311, "Desktop"],
	[13, 18, 20, 1500, null, null, "manual"],
	[10, 21, 9, 2786, 0.338, 0.383, "Tablet"],
	[9, 7, 46, 954, 0.383, 0.398, "Mobile"],
	[8, 21, 31, 1846, 0.398, 0.426, "Desktop"],
	[6, 16, 4, 3518, 0.426, 0.491, "Tablet"],
	[4, 8, 7, 681, 0.491, 0.503, "Mobile"],
	[4, 22, 18, 1557, 0.503, 0.529, "Desktop"],
	[2, 20, 47, 2339, 0.529, 0.576, "Desktop"],
	[1, 21, 23, 2924, 0.576, 0.631, "Tablet"],
];
const sessions = (scenario === "empty" ? [] : diary).map(
	([daysAgo, hour, minute, seconds, , , device]) => {
		const start = new Date(now);
		start.setDate(start.getDate() - daysAgo);
		start.setHours(hour, minute, 0, 0);
		return {
			id: crypto.randomUUID(),
			runId,
			startedAt: start.toISOString(),
			endedAt: new Date(start.getTime() + seconds * 1000).toISOString(),
			state: "finished",
			mode: device === "manual" ? "retrospective" : "automatic",
			source: device === "manual" ? "manual" : "web",
			device: device === "manual" ? "" : device,
			installationId: crypto.randomUUID(),
			contentVersion: "test",
			timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
			revision: 1,
			discardedAt: null,
		};
	},
);
const segments = sessions.map((s, i) => ({
	id: crypto.randomUUID(),
	sessionId: s.id,
	startedAt: s.startedAt,
	endedAt: s.endedAt,
	seconds: diary[i]?.[3] ?? 0,
	startPosition: diary[i]?.[4] ?? null,
	endPosition: diary[i]?.[5] ?? null,
	kind: s.mode === "retrospective" ? "manual" : "reading",
}));
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const runs = [
	{
		id: runId,
		userId: "test",
		bookId: 1,
		startedAt: sessions[0]?.startedAt ?? new Date(now).toISOString(),
		endedAt: null,
		state: "reading",
	},
	...(scenario === "runs"
		? [1, 2, 3].map((monthsAgo) => ({
				id: crypto.randomUUID(),
				userId: "test",
				bookId: 1,
				startedAt: new Date(now - monthsAgo * 30 * 86400000).toISOString(),
				endedAt: new Date(now - (monthsAgo * 30 - 7) * 86400000).toISOString(),
				state: "finished",
			}))
		: []),
];
const data = {
	runs,
	runId,
	sessions,
	segments,
	legacySeconds: 0,
	...summarizeReading(segments, sessions, timezone),
};
qc.setQueryData(
	orpc.readingSessions.history.queryKey({
		input: { bookUuid: "preview", timeZone: timezone },
	}),
	data,
);
qc.setQueryData(orpc.readingSessions.preferences.queryKey(), {
	mode: "manual",
	idleMinutes: 5,
});
declare global {
	interface Window {
		readingTestUploads: SessionUpload[];
		readingTestPosition: number;
	}
}
window.readingTestUploads = [];
window.readingTestPosition = 0.39;
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
	const url =
		typeof input === "string"
			? input
			: input instanceof Request
				? input.url
				: input.toString();
	if (url.includes("/rpc/readingSessions/")) {
		if (!navigator.onLine) throw new TypeError("Offline fixture");
		if (url.includes("/sync")) {
			const body =
				typeof init?.body === "string"
					? init.body
					: input instanceof Request
						? await input.clone().text()
						: null;
			if (!body) throw new Error("Missing reading-session fixture upload body");
			window.readingTestUploads.push(JSON.parse(body).json);
		}
		const json = url.includes("/history")
			? data
			: url.includes("/sync")
				? { runId }
				: { mode: "manual", idleMinutes: 5 };
		return new Response(JSON.stringify({ json }), {
			headers: { "Content-Type": "application/json" },
		});
	}
	return originalFetch(input, init);
};
function Preview() {
	const tracker = useReadingTracker({
		userId: "preview",
		bookUuid: "preview",
		contentVersion: "test",
		enabled: true,
		bookCharCount: 100000,
		getPosition: () => window.readingTestPosition,
	});
	return (
		<>
			<ReaderHeader
				open
				onOpen={() => {}}
				theme={{ fontColor: "#eee", backgroundColor: "#171717" } as never}
				bookTitle="El nombre del viento"
				hasChapterData
				hasImages={false}
				searchAvailable={false}
				onTocClick={() => {}}
				onCompleteBook={() => {}}
				onFullscreenClick={() => {}}
				onImageGalleryClick={() => {}}
				onSearchClick={() => {}}
				onQuickSettingsClick={() => {}}
				readListenAvailable={false}
				readListenActive={false}
				onReadListenClick={() => {}}
				onExitClick={() => {}}
				sessionControl={<ReadingSessionControl tracker={tracker} />}
			/>
			<main className="mx-auto max-w-5xl px-5 py-24 sm:px-10">
				<p className="mb-2 text-muted-foreground text-sm">Patrick Rothfuss</p>
				<h1 className="mb-10 font-medium text-3xl">El nombre del viento</h1>
				<ReadingHistory bookUuid="preview" />
			</main>
		</>
	);
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root");
createRoot(root).render(
	<QueryClientProvider client={qc}>
		<Preview />
	</QueryClientProvider>,
);
