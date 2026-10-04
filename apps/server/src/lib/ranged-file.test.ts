import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { restoreFileBody } from "./file-body";
import { parseByteRange, serveRangedFile } from "./ranged-file";

describe("parseByteRange", () => {
	test("accepts bounded, open-ended, and suffix ranges", () => {
		expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
		expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
		expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
	});

	test("clamps an end beyond the file and rejects unsatisfied ranges", () => {
		expect(parseByteRange("bytes=90-200", 100)).toEqual({ start: 90, end: 99 });
		expect(parseByteRange("bytes=100-", 100)).toBe("invalid");
		expect(parseByteRange("items=0-1", 100)).toBe("invalid");
	});
});

describe("serveRangedFile over the wire", () => {
	const dir = mkdtempSync(join(tmpdir(), "ranged-"));
	const path = join(dir, "track.m4b");
	writeFileSync(path, Buffer.alloc(5000, 7));
	// As in the real app: CORS rebuilds the response after the route.
	const app = new Hono()
		.use("/*", cors({ origin: "http://web", credentials: true }))
		.get("/", (c) => serveRangedFile(c, { path, mimeType: "audio/mp4" }));
	const server = Bun.serve({
		port: 0,
		fetch: async (request) => restoreFileBody(await app.fetch(request)),
	});
	afterAll(() => {
		server.stop(true);
		rmSync(dir, { recursive: true, force: true });
	});

	// Download progress needs the length: a chunked reply showed 0% forever.
	test("a whole file goes out with its length, not chunked", async () => {
		const res = await fetch(server.url);
		expect(res.headers.get("content-length")).toBe("5000");
		expect(res.headers.get("transfer-encoding")).toBeNull();
		expect(res.headers.get("x-nanahoshi-file")).toBeNull();
		expect((await res.arrayBuffer()).byteLength).toBe(5000);
	});

	test("a range carries its own length and only its bytes", async () => {
		const res = await fetch(server.url, {
			headers: { Range: "bytes=100-199" },
		});
		expect(res.status).toBe(206);
		expect(res.headers.get("content-length")).toBe("100");
		expect((await res.arrayBuffer()).byteLength).toBe(100);
	});
});
