import "@/test-utils/setup-dom";

import { afterEach, describe, expect, mock, test } from "bun:test";

const { cleanup, fireEvent, render, screen, waitFor } = await import(
	"@testing-library/react"
);

const updateOpenLibrary = mock(async (patch: { enabled: boolean }) => patch);
const updateProvider = mock(async (patch: object) => patch);

const configs: Record<string, object> = {
	ranobedb: { enabled: true, dbReady: true },
	amazon: { enabled: true, domain: "co.jp", cookie: "" },
	googlebooks: { enabled: true, apiKey: "", langRestrict: "" },
	openlibrary: { enabled: true },
	goodreads: { enabled: true },
	hardcover: { enabled: false, apiToken: "" },
	comicvine: { enabled: false, apiKey: "" },
};

mock.module("@tanstack/react-query", () => ({
	useQuery: (options: { queryKey: readonly string[] }) => ({
		data: configs[options.queryKey[1]],
		isLoading: false,
	}),
	useMutation: ({
		mutationFn,
		onSuccess,
		onError,
	}: {
		mutationFn: (variables: object) => Promise<object>;
		onSuccess?: (data: object) => void;
		onError?: (error: unknown) => void;
	}) => ({
		isPending: false,
		mutate: (
			variables: object,
			options?: { onSuccess?: (data: object) => void },
		) => {
			mutationFn(variables).then((data) => {
				onSuccess?.(data);
				options?.onSuccess?.(data);
			}, onError);
		},
	}),
}));

const queryOptions = (provider: string) => () => ({
	queryKey: ["metadata", provider] as const,
});

mock.module("@/utils/orpc", () => ({
	orpc: {
		settings: {
			getRanobedb: { queryOptions: queryOptions("ranobedb") },
			getAmazon: { queryOptions: queryOptions("amazon") },
			getGoogleBooks: { queryOptions: queryOptions("googlebooks") },
			getOpenLibrary: { queryOptions: queryOptions("openlibrary") },
			getGoodreads: { queryOptions: queryOptions("goodreads") },
			getHardcover: { queryOptions: queryOptions("hardcover") },
			getComicvine: { queryOptions: queryOptions("comicvine") },
		},
	},
	client: {
		settings: {
			updateRanobedb: updateProvider,
			updateAmazon: updateProvider,
			updateGoogleBooks: updateProvider,
			updateOpenLibrary,
			updateGoodreads: updateProvider,
			updateHardcover: updateProvider,
			updateComicvine: updateProvider,
		},
	},
	queryClient: {
		setQueryData: mock(() => {}),
		invalidateQueries: mock(() => {}),
	},
}));

mock.module("sonner", () => ({
	toast: {
		success: mock(() => {}),
		error: mock(() => {}),
	},
}));

const { MetadataOrgSettings } = await import("./metadata");

afterEach(() => {
	cleanup();
	updateOpenLibrary.mockClear();
	updateProvider.mockClear();
});

describe("MetadataOrgSettings", () => {
	test("renders every ebook provider from the shared catalog", () => {
		render(<MetadataOrgSettings />);

		expect(screen.getAllByRole("article")).toHaveLength(7);
		expect(
			document.querySelectorAll('img[src^="/provider-icons/"]'),
		).toHaveLength(7);
		for (const provider of [
			"RanobeDB",
			"Amazon",
			"Google Books",
			"Open Library",
			"Goodreads",
			"Hardcover",
			"Comic Vine",
		]) {
			expect(screen.getByText(provider)).toBeTruthy();
		}
	});

	test("persists a provider toggle immediately", async () => {
		render(<MetadataOrgSettings />);

		fireEvent.click(screen.getByRole("switch", { name: /Open Library/i }));

		await waitFor(() => {
			expect(updateOpenLibrary).toHaveBeenCalledWith({ enabled: false });
		});
	});
});
