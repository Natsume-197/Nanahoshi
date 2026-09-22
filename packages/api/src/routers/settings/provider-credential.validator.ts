import {
	fetchOrTransient,
	ProviderCredentialError,
} from "../books/metadata/providers/provider.utils";

async function requireOk(provider: string, response: Response) {
	if (!response.ok) {
		throw new Error(
			`${provider} credential probe failed (HTTP ${response.status})`,
		);
	}
}

export async function validateGoogleBooksCredential(apiKey: string) {
	const url = new URL("https://www.googleapis.com/books/v1/volumes");
	url.searchParams.set("q", "isbn:9780140328721");
	url.searchParams.set("maxResults", "1");
	url.searchParams.set("key", apiKey);
	const response = await fetchOrTransient("Google Books", url, {
		headers: { Accept: "application/json" },
	});
	await requireOk("Google Books", response);
}

export async function validateComicvineCredential(apiKey: string) {
	const url = new URL("https://comicvine.gamespot.com/api/issues/");
	url.searchParams.set("api_key", apiKey);
	url.searchParams.set("format", "json");
	url.searchParams.set("limit", "1");
	const response = await fetchOrTransient("Comicvine", url, {
		headers: {
			Accept: "application/json",
			"User-Agent": "Nanahoshi metadata credential check",
		},
	});
	await requireOk("Comicvine", response);
	const payload = (await response.json()) as { status_code?: number };
	if (payload.status_code !== 1) throw new ProviderCredentialError("Comicvine");
}

export async function validateHardcoverCredential(apiToken: string) {
	const response = await fetchOrTransient(
		"Hardcover",
		"https://api.hardcover.app/v1/graphql",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiToken}`,
			},
			body: JSON.stringify({ query: "query CredentialCheck { me { id } }" }),
		},
	);
	await requireOk("Hardcover", response);
	const payload = (await response.json()) as {
		errors?: unknown[];
		data?: { me?: unknown };
	};
	if (payload.errors?.length || !payload.data?.me) {
		throw new ProviderCredentialError("Hardcover");
	}
}
