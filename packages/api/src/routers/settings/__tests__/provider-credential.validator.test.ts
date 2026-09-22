import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	validateComicvineCredential,
	validateGoogleBooksCredential,
	validateHardcoverCredential,
} from "../provider-credential.validator";

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

describe("provider credential validation", () => {
	test("accepts a Google Books key only after a successful probe", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(JSON.stringify({ totalItems: 0 }), { status: 200 }),
		) as typeof fetch;
		await expect(
			validateGoogleBooksCredential("valid"),
		).resolves.toBeUndefined();
	});

	test("rejects a Google Books key on 401/403", async () => {
		globalThis.fetch = mock(
			async () => new Response(null, { status: 403 }),
		) as typeof fetch;
		await expect(
			validateGoogleBooksCredential("invalid"),
		).rejects.toMatchObject({
			code: "invalid_credentials",
			status: 403,
		});
	});

	test("rejects Comicvine's HTTP-200 authentication error", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({ status_code: 100, error: "Invalid API Key" }),
				),
		) as typeof fetch;
		await expect(validateComicvineCredential("invalid")).rejects.toMatchObject({
			code: "invalid_credentials",
		});
	});

	test("rejects a Hardcover token when GraphQL reports authentication errors", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(JSON.stringify({ errors: [{ message: "JWT invalid" }] })),
		) as typeof fetch;
		await expect(validateHardcoverCredential("invalid")).rejects.toMatchObject({
			code: "invalid_credentials",
		});
	});
});
