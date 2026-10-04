import { describe, expect, mock, test } from "bun:test";
import { guardFetch } from "./network-guard";

describe("guardFetch", () => {
	const ok = () => mock(async () => new Response("ok"));

	test("fails server requests like a phone without network", async () => {
		const real = ok();
		const guarded = guardFetch(real, () => true);
		await expect(guarded("http://192.168.1.35:7333/rpc/x")).rejects.toThrow(
			"Network request failed",
		);
		await expect(
			guarded(new Request("https://books.example.com/api/auth/ok")),
		).rejects.toThrow(TypeError);
		expect(real).not.toHaveBeenCalled();
	});

	test("lets local files through while offline", async () => {
		const real = ok();
		const guarded = guardFetch(real, () => true);
		await guarded("file:///data/user/0/app/files/books/x/entry.json");
		expect(real).toHaveBeenCalledTimes(1);
	});

	test("reads the switch on every request", async () => {
		let offline = true;
		const real = ok();
		const guarded = guardFetch(real, () => offline);
		await expect(guarded("http://server/rpc")).rejects.toThrow();
		offline = false;
		await guarded("http://server/rpc");
		expect(real).toHaveBeenCalledTimes(1);
	});
});
