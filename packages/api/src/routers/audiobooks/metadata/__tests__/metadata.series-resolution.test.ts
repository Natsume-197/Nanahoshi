import { expect, mock, test } from "bun:test";

const stored = new Map([["本好きの下剋上", 1]]);
const names: string[] = [];
mock.module("@nanahoshi-v2/db", () => ({
	db: {
		insert: () => ({
			values: ({ name }: { name: string }) => ({
				onConflictDoUpdate: () => ({
					returning: async () => {
						names.push(name);
						if (!stored.has(name)) stored.set(name, stored.size + 1);
						return [{ id: stored.get(name) }];
					},
				}),
			}),
		}),
		select: () => {
			throw new Error("Inference must not search or rename prefix matches");
		},
		update: () => {
			throw new Error("Inference must not rename an existing series");
		},
	},
}));
const { AudiobookMetadataRepository } = await import("../metadata.repository");

test("inferred spinoffs stay separate from an existing umbrella series", async () => {
	const repository = new AudiobookMetadataRepository();
	const name = "本好きの下剋上 ハンネローレの貴族院五年生";
	expect(await repository.resolveInferredSeries(name, "server")).toEqual({
		id: 2,
		name,
	});
	expect(await repository.resolveInferredSeries(name, "server")).toEqual({
		id: 2,
		name,
	});
	expect(stored.get("本好きの下剋上")).toBe(1);
	expect(names).toEqual([name, name]);
});
