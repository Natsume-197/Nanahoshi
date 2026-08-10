import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ModalCredentialStore } from "../modal-credentials";

const temporaryDirectories: string[] = [];

async function createStore() {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "modal-creds-"));
	temporaryDirectories.push(directory);
	return {
		directory,
		credentialsPath: path.join(directory, "secrets", "modal.json"),
		profilePath: path.join(directory, ".modal.toml"),
		store: new ModalCredentialStore({
			credentialsPath: path.join(directory, "secrets", "modal.json"),
			profilePath: path.join(directory, ".modal.toml"),
		}),
	};
}

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => fs.rm(directory, { recursive: true, force: true })),
	);
});

describe("Modal credential store", () => {
	test("writes managed credentials with restricted permissions", async () => {
		const { credentialsPath, store } = await createStore();
		await store.save({ tokenId: "token-id", tokenSecret: "token-secret" });

		expect(await store.readManaged()).toEqual({
			tokenId: "token-id",
			tokenSecret: "token-secret",
		});
		expect((await fs.stat(path.dirname(credentialsPath))).mode & 0o777).toBe(
			0o700,
		);
		expect((await fs.stat(credentialsPath)).mode & 0o777).toBe(0o600);
	});

	test("injects managed credentials without overriding complete environment credentials", async () => {
		const { store } = await createStore();
		await store.save({ tokenId: "managed-id", tokenSecret: "managed-secret" });

		expect(await store.environment({ OTHER: "value" })).toEqual({
			OTHER: "value",
			MODAL_TOKEN_ID: "managed-id",
			MODAL_TOKEN_SECRET: "managed-secret",
		});
		expect(
			await store.environment({
				MODAL_TOKEN_ID: "environment-id",
				MODAL_TOKEN_SECRET: "environment-secret",
			}),
		).toEqual({
			MODAL_TOKEN_ID: "environment-id",
			MODAL_TOKEN_SECRET: "environment-secret",
		});
	});

	test("reports effective source without returning credential values", async () => {
		const { profilePath, store } = await createStore();
		await fs.writeFile(
			profilePath,
			'token_id = "profile-id"\ntoken_secret = "profile-secret"\n',
		);
		expect(await store.status({})).toEqual({
			configured: true,
			source: "profile",
			managedConfigured: false,
		});

		await store.save({ tokenId: "managed-id", tokenSecret: "managed-secret" });
		expect(await store.status({})).toEqual({
			configured: true,
			source: "nanahoshi",
			managedConfigured: true,
		});
		expect(
			await store.status({
				MODAL_TOKEN_ID: "environment-id",
				MODAL_TOKEN_SECRET: "environment-secret",
			}),
		).toEqual({
			configured: true,
			source: "environment",
			managedConfigured: true,
		});
	});

	test("removes only Nanahoshi-managed credentials", async () => {
		const { store } = await createStore();
		await store.save({ tokenId: "token-id", tokenSecret: "token-secret" });
		await store.remove();

		expect(await store.readManaged()).toBeNull();
		expect(await store.status({})).toEqual({
			configured: false,
			source: null,
			managedConfigured: false,
		});
	});
});
