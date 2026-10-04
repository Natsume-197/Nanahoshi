import { beforeEach, expect, mock, test } from "bun:test";
import { ORPCError } from "@orpc/client";

process.env.EXPO_OS = "android";

class FakeEntry {
	uri: string;
	constructor(...parts: (string | FakeEntry)[]) {
		this.uri = parts
			.map((part) => (typeof part === "string" ? part : part.uri))
			.join("/");
	}
	exists = false;
	delete() {}
	create() {}
}
mock.module("expo-file-system", () => ({
	Directory: FakeEntry,
	File: FakeEntry,
	Paths: { cache: "cache" },
}));
mock.module("expo-sharing", () => ({ shareAsync: async () => undefined }));
let downloadFails: Error | null = null;
mock.module("./files", () => ({
	downloadInto: async (_url: string, target: FakeEntry) => {
		if (downloadFails) throw downloadFails;
		return target;
	},
}));

const discarded: string[] = [];
let pickedTarget: string | null = null;
let writeFails = false;
let writes = 0;
mock.module("./save-to-device", () => ({
	pickSaveTarget: async () => pickedTarget,
	writeToDocument: async (
		_source: unknown,
		_target: string,
		onProgress: (fraction: number) => void,
	) => {
		writes++;
		onProgress(0.5);
		if (writeFails) throw new Error("disk full");
		onProgress(1);
	},
	discardDocument: (target: string) => discarded.push(target),
}));

const { ExportManager } = await import("./export");

const SAVED_TO =
	"content://com.android.externalstorage.documents/document/primary%3ADownload%2FDune.epub";

function createExports(
	signedUrl: () => Promise<{ url: string; filename: string }>,
) {
	return new ExportManager({
		serverUrl: "http://phone-sees-server",
		auth: { getCookie: async () => "session=1" },
		api: {
			client: { files: { getSignedDownloadUrl: signedUrl } },
			orpc: {
				audiobooks: { getDetails: { queryOptions: () => ({}) } },
			},
		},
		queryClient: { fetchQuery: async () => ({ filesizeKb: 1024 }) },
	} as unknown as ConstructorParameters<typeof ExportManager>[0]);
}

const ok = async () => ({
	url: "http://server/download/dune?exp=1&sig=x",
	filename: "Dune.epub",
});

beforeEach(() => {
	downloadFails = null;
	pickedTarget = SAVED_TO;
	writeFails = false;
	writes = 0;
	discarded.length = 0;
});

test("on Android the file waits for Share or Save, then says where it went", async () => {
	const exports = createExports(ok);
	await exports.start("book", "dune", "Dune");
	expect(exports.getSnapshot()?.phase).toBe("ready");

	await exports.save();
	expect(exports.getSnapshot()).toMatchObject({
		phase: "saved",
		location: "Download/Dune.epub",
	});
});

test("backing out of the folder picker keeps the file ready to save or share", async () => {
	const exports = createExports(ok);
	await exports.start("book", "dune", "Dune");
	pickedTarget = null;
	await exports.save();
	expect(exports.getSnapshot()?.phase).toBe("ready");
	expect(writes).toBe(0);
});

test("a failed save removes the half-written file and retries without downloading again", async () => {
	let downloads = 0;
	const exports = createExports(async () => {
		downloads++;
		return ok();
	});
	await exports.start("book", "dune", "Dune");
	writeFails = true;
	await exports.save();
	expect(exports.getSnapshot()).toMatchObject({
		phase: "failed",
		reason: "save",
	});
	expect(discarded).toEqual([SAVED_TO]);

	writeFails = false;
	exports.retry();
	await Bun.sleep(0);
	expect(exports.getSnapshot()?.phase).toBe("saved");
	expect(downloads).toBe(1);
});

test("no download permission says so instead of offering a retry", async () => {
	const exports = createExports(async () => {
		throw new ORPCError("FORBIDDEN");
	});
	await exports.start("audiobook", "dune", "Dune");
	expect(exports.getSnapshot()).toMatchObject({
		phase: "failed",
		reason: "forbidden",
	});
});

test("closing the bar mid-download leaves nothing behind", async () => {
	const exports = createExports(ok);
	const running = exports.start("book", "dune", "Dune");
	exports.dismiss();
	await running;
	expect(exports.getSnapshot()).toBeNull();
});
