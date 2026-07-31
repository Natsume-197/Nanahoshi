import { beforeEach, describe, expect, mock, test } from "bun:test";

const rename = mock(() =>
	Promise.resolve<"ok" | "not_found" | "conflict">("ok"),
);
mock.module("../series.repository", () => ({
	seriesRepository: { rename },
}));

const { renameSeries } = await import("../series.service");

describe("renameSeries", () => {
	beforeEach(() => {
		rename.mockClear();
		rename.mockImplementation(() => Promise.resolve("ok"));
	});

	test("returns the repository result", async () => {
		const result = await renameSeries({
			uuid: "series-uuid",
			serverId: "server-1",
			name: "New name",
		});

		expect(result).toBe("ok");
		expect(rename).toHaveBeenCalledTimes(1);
	});

	test("does not enqueue anything when the rename is rejected", async () => {
		rename.mockImplementation(() => Promise.resolve("conflict"));

		expect(
			await renameSeries({
				uuid: "series-uuid",
				serverId: "server-1",
				name: "Taken",
			}),
		).toBe("conflict");
	});
});
