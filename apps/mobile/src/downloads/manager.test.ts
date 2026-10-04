import { beforeEach, expect, mock, test } from "bun:test";
import type { DownloadEntry } from "./model";

// An in-memory disk: which files exist and each title's entry.
type FakeFile = { path: string };
const files = new Set<string>();
const entries = new Map<string, DownloadEntry>();
const fetched: string[] = [];
let free = 10 * 1024 ** 3;
const smartStates = new Map<
	string,
	{ collections: never[]; dismissed: string[] }
>();
let network: (
	url: string,
	target: FakeFile,
	signal?: AbortSignal,
) => Promise<void>;

const key = (kind: string, serverId: string, uuid: string) =>
	`${kind}/${serverId}/${uuid}`;

mock.module("./files", () => ({
	coverFile: (kind: string, serverId: string, uuid: string) => ({
		path: `${key(kind, serverId, uuid)}/cover.jpg`,
	}),
	trackFile: (serverId: string, uuid: string, name: string) => ({
		path: `${key("audiobook", serverId, uuid)}/${name}`,
	}),
	hasFile: (file: FakeFile) => files.has(file.path),
	downloadInto: async (
		url: string,
		target: FakeFile,
		transfer: { signal?: AbortSignal },
	) => {
		await network(url, target, transfer.signal);
		files.add(target.path);
		return target;
	},
	ensureBookFile: async (options: {
		serverId: string;
		uuid: string;
		filename: string;
		resolveUrl: () => Promise<string>;
		signal?: AbortSignal;
	}) => {
		const target = {
			path: `${key("book", options.serverId, options.uuid)}/${options.filename}`,
		};
		await network(await options.resolveUrl(), target, options.signal);
		files.add(target.path);
		return target;
	},
	readEntry: (kind: string, serverId: string, uuid: string) =>
		entries.get(key(kind, serverId, uuid)) ?? null,
	writeEntry: (entry: DownloadEntry) =>
		entries.set(key(entry.kind, entry.serverId, entry.uuid), entry),
	removeDownload: (kind: string, serverId: string, uuid: string) => {
		const prefix = `${key(kind, serverId, uuid)}/`;
		entries.delete(key(kind, serverId, uuid));
		for (const path of [...files])
			if (path.startsWith(prefix)) files.delete(path);
	},
	saveAudiobookMeta: () => undefined,
	saveBookMeta: () => undefined,
	freeSpace: () => free,
	readSmartState: (serverId: string) =>
		smartStates.get(serverId) ?? { collections: [], dismissed: [] },
	writeSmartState: (
		serverId: string,
		state: { collections: never[]; dismissed: string[] },
	) => smartStates.set(serverId, state),
}));
mock.module("@/lib/covers", () => ({ coverUrl: () => null }));
mock.module("@/lib/format", () => ({
	titleOrUntitled: (title: string | null) => title ?? "Untitled",
}));
mock.module("@/player/engine", () => ({
	playerBookFrom: (uuid: string, details: AudiobookDetails) => ({
		uuid,
		title: details.title,
		cover: null,
		color: null,
		authors: [],
		narrators: [],
		chapters: [],
		files: details.audioFiles,
		duration: 30,
		seriesUuid: null,
	}),
}));

type AudiobookDetails = {
	title: string;
	filename: string;
	audioFiles: { index: number; duration: number; filename: string }[];
};

const { DownloadManager } = await import("./manager");

const audiobook: AudiobookDetails = {
	title: "Dune",
	filename: "Dune",
	audioFiles: [
		{ index: 0, duration: 10, filename: "01.mp3" },
		{ index: 1, duration: 10, filename: "02.mp3" },
		{ index: 2, duration: 10, filename: "03.mp3" },
	],
};

function createManager() {
	const client = {
		books: {
			getBookResolvingOrg: async ({ uuid }: { uuid: string }) => ({
				book: { title: `Book ${uuid}`, filename: `${uuid}.epub`, cover: null },
			}),
		},
		files: {
			getReaderUrl: async ({ uuid }: { uuid: string }) => ({
				url: `http://server/read/${uuid}`,
			}),
			getAudioFileDownloadUrl: async ({
				fileIndex,
			}: {
				fileIndex: number;
			}) => ({
				url: `http://server/download/file/${fileIndex}`,
			}),
		},
	};
	const orpc = {
		books: { getBookWithMetadata: { queryOptions: () => ({}) } },
		audiobooks: { getDetails: { queryOptions: () => ({ kind: "details" }) } },
	};
	const queryClient = {
		fetchQuery: async (options: { kind?: string }) =>
			options.kind === "details" ? audiobook : { authors: [{ name: "Ada" }] },
	};
	return new DownloadManager({
		serverUrl: "http://phone-sees-server",
		auth: { getCookie: async () => "session=1" },
		api: { client, orpc },
		queryClient,
	} as unknown as ConstructorParameters<typeof DownloadManager>[0]);
}

/** Resolves once the manager has nothing queued or running. */
function settled(manager: InstanceType<typeof DownloadManager>) {
	return new Promise<void>((resolve) => {
		const check = () => {
			if (
				Object.values(manager.getSnapshot().jobs).every(
					(job) => job.status === "failed",
				)
			) {
				unsubscribe();
				resolve();
			}
		};
		const unsubscribe = manager.subscribe(check);
		check();
	});
}

beforeEach(() => {
	files.clear();
	entries.clear();
	smartStates.clear();
	free = 10 * 1024 ** 3;
	fetched.length = 0;
	network = async (url) => {
		fetched.push(url);
	};
});

test("an audiobook downloads every track and is then complete", async () => {
	const manager = createManager();
	manager.download("audiobook", "dune", "s1");
	await settled(manager);
	expect(entries.get("audiobook/s1/dune")?.complete).toBe(true);
	expect([...files].filter((path) => /\/\d\.mp3$/.test(path)).sort()).toEqual([
		"audiobook/s1/dune/0.mp3",
		"audiobook/s1/dune/1.mp3",
		"audiobook/s1/dune/2.mp3",
	]);
	// Signed links point at the address the phone reaches the server by.
	expect(fetched[0]).toBe("http://phone-sees-server/download/file/0");
});

test("a cut-off audiobook resumes without fetching its finished tracks again", async () => {
	network = async (url) => {
		fetched.push(url);
		if (url.endsWith("/2")) throw new Error("connection lost");
	};
	const manager = createManager();
	manager.download("audiobook", "dune", "s1");
	await settled(manager);
	expect(manager.getSnapshot().jobs.dune?.status).toBe("failed");
	expect(entries.get("audiobook/s1/dune")?.complete).toBe(false);

	fetched.length = 0;
	network = async (url) => {
		fetched.push(url);
	};
	manager.download("audiobook", "dune", "s1");
	await settled(manager);
	expect(fetched).toEqual(["http://phone-sees-server/download/file/2"]);
	expect(entries.get("audiobook/s1/dune")?.complete).toBe(true);
	expect(manager.getSnapshot().jobs.dune).toBeUndefined();
});

test("cancelling mid-download leaves nothing of the title behind", async () => {
	let release = () => {};
	network = (url, _target, signal) =>
		new Promise((resolve, reject) => {
			fetched.push(url);
			signal?.addEventListener("abort", () => reject(new Error("aborted")));
			release = resolve;
		});
	const manager = createManager();
	manager.download("audiobook", "dune", "s1");
	while (fetched.length === 0) await Bun.sleep(1);
	manager.cancel("dune");
	release();
	await settled(manager);
	expect(entries.has("audiobook/s1/dune")).toBe(false);
	expect([...files]).toEqual([]);
	expect(manager.getSnapshot().jobs.dune).toBeUndefined();
});

test("downloads run one at a time, in the order they were asked for", async () => {
	const manager = createManager();
	manager.download("book", "a", "s1");
	manager.download("book", "b", "s1");
	expect(manager.getSnapshot().jobs.b?.status).toBe("queued");
	await settled(manager);
	expect(fetched).toEqual([
		"http://phone-sees-server/read/a",
		"http://phone-sees-server/read/b",
	]);
	expect(entries.get("book/s1/a")).toMatchObject({
		complete: true,
		authors: ["Ada"],
	});
});

test("a book the reader opened shows up once, without replacing a download", () => {
	const manager = createManager();
	const before = manager.getSnapshot().version;
	manager.recordOpenedBook("s1", "x", {
		title: "Opened",
		cover: null,
	} as never);
	manager.recordOpenedBook("s1", "x", { title: "Again", cover: null } as never);
	expect(entries.get("book/s1/x")?.title).toBe("Opened");
	expect(manager.getSnapshot().version).toBe(before + 1);
});

test("a download keeps why it came and the series it belongs to", async () => {
	const manager = createManager();
	manager.download("book", "v2", "s1", [{ type: "series" }]);
	await settled(manager);
	expect(entries.get("book/s1/v2")).toMatchObject({
		reasons: [{ type: "series" }],
		finishedAt: null,
	});
});

test("a smart download waits rather than fill the phone; yours doesn't", async () => {
	free = 512 * 1024 ** 2;
	const manager = createManager();
	manager.download("book", "auto", "s1", [{ type: "want" }]);
	manager.download("book", "mine", "s1");
	await settled(manager);
	expect(entries.has("book/s1/auto")).toBe(false);
	expect(entries.get("book/s1/mine")?.complete).toBe(true);
});

test("what you delete stays deleted until you download it again", async () => {
	const manager = createManager();
	manager.download("book", "a", "s1", [{ type: "reading" }]);
	await settled(manager);
	manager.remove("book", "s1", "a");
	expect(manager.isDismissed("s1", "a")).toBe(true);
	manager.download("book", "a", "s1");
	expect(manager.isDismissed("s1", "a")).toBe(false);
});

test("smart downloads clearing a title don't count as you deleting it", async () => {
	const manager = createManager();
	manager.download("book", "a", "s1", [{ type: "series" }]);
	await settled(manager);
	manager.remove("book", "s1", "a", { byUser: false });
	expect(manager.isDismissed("s1", "a")).toBe(false);
});
