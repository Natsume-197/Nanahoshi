import { beforeEach, describe, expect, mock, test } from "bun:test";

const rename = mock(() =>
	Promise.resolve<"ok" | "not_found" | "conflict">("ok"),
);
mock.module("../author.repository", () => ({
	authorRepository: { rename },
}));

const { updateAuthor } = await import("../author.service");

describe("updateAuthor", () => {
	beforeEach(() => {
		rename.mockClear();
		rename.mockImplementation(() => Promise.resolve("ok"));
	});

	test("returns the repository result", async () => {
		const result = await updateAuthor({
			uuid: "author-uuid",
			serverId: "server-1",
			name: "New name",
		});

		expect(result).toBe("ok");
		expect(rename).toHaveBeenCalledTimes(1);
	});

	test("does not enqueue anything when the update is rejected", async () => {
		rename.mockImplementation(() => Promise.resolve("not_found"));

		expect(
			await updateAuthor({
				uuid: "author-uuid",
				serverId: "server-1",
				name: "Missing",
			}),
		).toBe("not_found");
	});
});
