import { mock } from "bun:test";
import { bindReaderHost, type ReaderApi, type ReaderHost } from "./reader-host";

type DeepPartial<T> = { [K in keyof T]?: DeepPartial<T[K]> };

/** Binds a host whose API holds only the procedures a test supplies. */
export function bindFakeReaderHost(
	api: DeepPartial<ReaderApi>,
	overrides: Partial<Omit<ReaderHost, "api">> = {},
) {
	const host: ReaderHost = {
		api: api as ReaderApi,
		locale: () => "en",
		coverUrl: (filename, width) =>
			`https://server/covers/${filename}?w=${width}`,
		setChromeColor: mock(() => {}),
		notifyError: mock(() => {}),
		openAppRoute: mock(() => {}),
		usePlayAudiobook: () => async () => {},
		onProgressSaved: mock(() => {}),
		onReadingSessionEnded: mock(() => {}),
		...overrides,
	};
	bindReaderHost(host);
	return host;
}
