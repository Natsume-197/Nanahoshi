import { describe, expect, test } from "bun:test";
import { createORPCClient, ORPCError } from "@orpc/client";
import { createReaderHost } from "./host";
import { createReaderPageBridge, ReaderBridgeLink } from "./page";
import type { HostToReaderMessage, ReaderToHostMessage } from "./protocol";

function connect(client: object, overrides = {}) {
	const received: ReaderToHostMessage[] = [];
	let host: ReturnType<typeof createReaderHost>;
	const page = createReaderPageBridge((raw) => host.handle(raw));
	host = createReaderHost({
		client,
		overrides,
		// JSON round trip: exactly what crosses the WebView boundary.
		deliver: (message) =>
			page.receive(JSON.parse(JSON.stringify(message)) as HostToReaderMessage),
		onMessage: (message) => received.push(message),
	});
	const rpc = createORPCClient<{
		readingProgress: {
			getProgress: (
				input: { bookUuid: string },
				options?: { signal?: AbortSignal },
			) => Promise<unknown>;
		};
		files: { getReaderUrl: (input: { uuid: string }) => Promise<unknown> };
	}>(new ReaderBridgeLink(page));
	return { page, rpc, received };
}

describe("reader bridge", () => {
	test("forwards a procedure to the host client and keeps Dates intact", async () => {
		const updatedAt = new Date("2026-09-01T10:00:00.000Z");
		const { rpc } = connect({
			readingProgress: {
				getProgress: async ({ bookUuid }: { bookUuid: string }) => ({
					bookUuid,
					positionUpdatedAt: updatedAt,
					positionIntentAt: undefined,
				}),
			},
		});

		const result = (await rpc.readingProgress.getProgress({
			bookUuid: "b1",
		})) as { bookUuid: string; positionUpdatedAt: Date };

		expect(result.bookUuid).toBe("b1");
		expect(result.positionUpdatedAt).toBeInstanceOf(Date);
		expect(result.positionUpdatedAt.getTime()).toBe(updatedAt.getTime());
	});

	test("rejects with the host's ORPCError code", async () => {
		const { rpc } = connect({
			readingProgress: {
				getProgress: async () => {
					throw new ORPCError("FORBIDDEN", { message: "no access" });
				},
			},
		});

		const error = await rpc.readingProgress
			.getProgress({ bookUuid: "b1" })
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(ORPCError);
		expect((error as ORPCError<string, unknown>).code).toBe("FORBIDDEN");
		expect((error as ORPCError<string, unknown>).status).toBe(403);
	});

	test("reports an unreachable server as unavailable, not as a server error", async () => {
		const { rpc } = connect({
			readingProgress: {
				getProgress: async () => {
					throw new TypeError("Network request failed");
				},
			},
		});

		const error = (await rpc.readingProgress
			.getProgress({ bookUuid: "b1" })
			.catch((e: unknown) => e)) as ORPCError<string, unknown>;

		expect(error.code).toBe("SERVICE_UNAVAILABLE");
		expect(error.message).toBe("Network request failed");
	});

	test("answers an overridden procedure without touching the client", async () => {
		const { rpc } = connect(
			{ files: { getReaderUrl: async () => ({ url: "https://server/read" }) } },
			{
				"files.getReaderUrl": async (input: unknown) => ({
					url: `file:///books/${(input as { uuid: string }).uuid}.epub`,
					filename: "a.epub",
				}),
			},
		);

		expect(await rpc.files.getReaderUrl({ uuid: "b1" })).toEqual({
			url: "file:///books/b1.epub",
			filename: "a.epub",
		});
	});

	test("an aborted call rejects immediately and ignores the late answer", async () => {
		let release: (value: unknown) => void = () => {};
		const { rpc } = connect({
			readingProgress: {
				getProgress: () => new Promise((resolve) => (release = resolve)),
			},
		});
		const controller = new AbortController();

		const call = rpc.readingProgress
			.getProgress({ bookUuid: "b1" }, { signal: controller.signal })
			.catch((e: unknown) => e);
		controller.abort(new Error("closed"));
		release({ late: true });

		expect(((await call) as Error).message).toBe("closed");
	});

	test("hands non-RPC messages to the host untouched", () => {
		const { page, received } = connect({});

		page.send({ type: "navigate", href: "/dashboard/books/b1" });

		expect(received).toEqual([
			{ type: "navigate", href: "/dashboard/books/b1" },
		]);
	});

	test("drains the saves a close starts, including ones chained after them", async () => {
		const saved: string[] = [];
		let finish!: () => void;
		const { page, rpc } = connect({
			readingProgress: {
				getProgress: ({ bookUuid }: { bookUuid: string }) =>
					new Promise((resolve) => {
						finish = () => {
							saved.push(bookUuid);
							resolve(null);
						};
					}),
			},
		});
		page.onClose(() => {
			// Like an unmount hook: the save starts a microtask later.
			void Promise.resolve().then(() =>
				rpc.readingProgress
					.getProgress({ bookUuid: "progress" })
					.then(() =>
						rpc.readingProgress.getProgress({ bookUuid: "presence" }),
					),
			);
		});

		page.receive({ type: "close" });
		let drained = false;
		const done = page.drained(50).then(() => {
			drained = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 80));
		expect(drained).toBe(false);
		finish();
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(drained).toBe(false);
		finish();
		await done;

		expect(saved).toEqual(["progress", "presence"]);
	});

	test("a page booted ahead of time receives the screen it is opened with", () => {
		const { page } = connect({});
		const opened: unknown[] = [];
		page.onOpen((message) => opened.push(message));
		const screen = {
			kind: "reader" as const,
			uuid: "b1",
			book: { title: "安達としまむら3", filename: "b1.epub" },
		};

		page.receive(
			JSON.parse(
				JSON.stringify({ type: "open", screen, serverId: "s1" }),
			) as HostToReaderMessage,
		);

		expect(opened).toEqual([{ type: "open", screen, serverId: "s1" }]);
	});
});
