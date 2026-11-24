import { describe, expect, test } from "bun:test";
import { fetchReleases, selectNewerReleases } from "../release-feed";

const release = (tag: string, extra: Record<string, unknown> = {}) => ({
	tag_name: tag,
	name: `Nanahoshi ${tag}`,
	body: `Notes for ${tag}`,
	html_url: `https://github.com/Natsume-197/Nanahoshi/releases/tag/${tag}`,
	published_at: "2026-11-01T00:00:00Z",
	draft: false,
	prerelease: false,
	...extra,
});

describe("selectNewerReleases", () => {
	const raw = [
		release("v1.2.0"),
		release("v1.4.0-rc.1", { prerelease: true }),
		release("v1.3.0"),
		release("v1.5.0", { draft: true }),
		release("nightly"),
		{ garbage: true },
	];

	test("keeps published stable releases newer than the running one, newest first", () => {
		const { latest, newer } = selectNewerReleases(raw, "v1.1.0");
		expect(latest?.version).toBe("v1.3.0");
		expect(newer.map((entry) => entry.version)).toEqual(["v1.3.0", "v1.2.0"]);
		expect(newer[0]?.notes).toBe("Notes for v1.3.0");
	});

	test("offers prereleases only to an instance on a prerelease", () => {
		const { latest } = selectNewerReleases(raw, "v1.3.0-rc.1");
		expect(latest?.version).toBe("v1.4.0-rc.1");
	});

	test("is empty when the running release is the newest", () => {
		expect(selectNewerReleases(raw, "v1.3.0").newer).toEqual([]);
	});

	test("rejects a response that isn't a list", () => {
		expect(() =>
			selectNewerReleases({ message: "rate limited" }, "v1.0.0"),
		).toThrow();
	});
});

describe("fetchReleases", () => {
	test("asks GitHub anonymously with a generic client name", async () => {
		let seen: { url: string; headers: Headers } | null = null;
		const fetcher = (async (url: string, init?: RequestInit) => {
			seen = { url, headers: new Headers(init?.headers) };
			return Response.json([]);
		}) as unknown as typeof fetch;
		await fetchReleases("Natsume-197/Nanahoshi", fetcher);
		expect(seen?.url).toBe(
			"https://api.github.com/repos/Natsume-197/Nanahoshi/releases?per_page=30",
		);
		expect(seen?.headers.get("user-agent")).toBe("Nanahoshi-update-check");
		expect(seen?.headers.get("authorization")).toBeNull();
	});

	test("throws on an error status", async () => {
		const fetcher = (async () =>
			new Response("", { status: 403 })) as unknown as typeof fetch;
		await expect(fetchReleases("a/b", fetcher)).rejects.toThrow("403");
	});
});
