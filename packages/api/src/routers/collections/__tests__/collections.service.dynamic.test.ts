import { afterEach, describe, expect, mock, test } from "bun:test";

mock.module("@nanahoshi-v2/env/server", () => ({
	env: {
		DATABASE_URL: "postgres://mock",
		NAMESPACE_UUID: "00000000-0000-0000-0000-000000000000",
		DOWNLOAD_SECRET: "00000000-0000-0000-0000-000000000001",
		CORS_ORIGIN: "http://localhost:3000",
		BETTER_AUTH_SECRET: "mock-secret-that-is-at-least-32-chars-long",
		BETTER_AUTH_URL: "http://localhost:3000",
		REDIS_HOST: "127.0.0.1",
		REDIS_PORT: 6379,
	},
}));
mock.module("@nanahoshi-v2/db", () => ({ db: {} }));

const { collectionsRepository } = await import("../collections.repository");
const collectionsService = await import("../collections.service");

const original = {
	findByName: collectionsRepository.findByName,
	create: collectionsRepository.create,
	getByIdForUser: collectionsRepository.getByIdForUser,
	addBook: collectionsRepository.addBook,
	removeBook: collectionsRepository.removeBook,
	touch: collectionsRepository.touch,
	listManualReferences: collectionsRepository.listManualReferences,
};

afterEach(() => Object.assign(collectionsRepository, original));

const definition = {
	version: 1 as const,
	root: {
		kind: "group" as const,
		match: "all" as const,
		children: [
			{
				kind: "rule" as const,
				field: "format" as const,
				operator: "includesAny" as const,
				value: ["epub"],
			},
		],
	},
	sort: [{ field: "title" as const, direction: "asc" as const }],
};

describe("Dynamic Collection service", () => {
	test("creates a validated live definition without a manual membership", async () => {
		collectionsRepository.findByName = mock(async () => null) as never;
		collectionsRepository.listManualReferences = mock(async () => []) as never;
		const create = mock(async (input) => ({ id: "collection-1", ...input }));
		collectionsRepository.create = create as never;

		const result = await collectionsService.createCollection(
			"owner-1",
			{
				name: "  Recent EPUBs  ",
				isPublic: false,
				kind: "dynamic",
				definition,
			},
			"server-1",
		);

		expect(create).toHaveBeenCalledWith({
			userId: "owner-1",
			serverId: "server-1",
			name: "Recent EPUBs",
			description: null,
			isPublic: false,
			kind: "dynamic",
			dynamicDefinition: definition,
		});
		expect(result.kind).toBe("dynamic");
	});

	test("rejects manual membership changes for a dynamic collection", async () => {
		collectionsRepository.getByIdForUser = mock(async () => ({
			id: "11111111-1111-4111-8111-111111111111",
			kind: "dynamic",
		})) as never;
		const addBook = mock(async () => true);
		collectionsRepository.addBook = addBook as never;

		let thrown: unknown;
		try {
			await collectionsService.setBookMembership(
				"owner-1",
				{
					collectionId: "11111111-1111-4111-8111-111111111111",
					bookUuid: "book-1",
					inCollection: true,
				},
				"server-1",
			);
		} catch (error) {
			thrown = error;
		}

		expect((thrown as { code?: string }).code).toBe("CONFLICT");
		expect(addBook).not.toHaveBeenCalled();
	});

	test("rejects an empty dynamic definition", async () => {
		collectionsRepository.findByName = mock(async () => null) as never;
		collectionsRepository.listManualReferences = mock(async () => []) as never;
		collectionsRepository.create = mock(async () => null) as never;

		await expect(
			collectionsService.createCollection(
				"owner-1",
				{
					name: "Empty",
					isPublic: false,
					kind: "dynamic",
					definition: {
						version: 1,
						root: { kind: "group", match: "all", children: [] },
						sort: [],
					},
				},
				"server-1",
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("rejects a public definition that references a private manual collection", async () => {
		collectionsRepository.findByName = mock(async () => null) as never;
		collectionsRepository.listManualReferences = mock(async () => [
			{
				id: "11111111-1111-4111-8111-111111111111",
				userId: "owner-1",
				isPublic: false,
			},
		]) as never;
		await expect(
			collectionsService.createCollection(
				"owner-1",
				{
					name: "Public derived shelf",
					isPublic: true,
					kind: "dynamic",
					definition: {
						...definition,
						root: {
							kind: "group",
							match: "all",
							children: [
								{
									kind: "rule",
									field: "manualCollection",
									operator: "includesAny",
									value: [
										{
											id: "11111111-1111-4111-8111-111111111111",
											label: "Private",
										},
									],
								},
							],
						},
					},
				},
				"server-1",
			),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});
});
