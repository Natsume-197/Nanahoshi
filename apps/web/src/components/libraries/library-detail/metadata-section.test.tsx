import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";

const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";

let providerAvailability: Record<string, boolean> = {
	ranobedb: true,
	amazon: false,
	googlebooks: true,
	openlibrary: true,
	goodreads: true,
	hardcover: true,
	comicvine: true,
};
mock.module("@/utils/orpc", () => ({
	queryClient: new QueryClient(),
	orpc: {
		libraries: {
			updateLibrary: {
				mutationOptions: () => ({
					mutationFn: async () => ({}),
				}),
			},
			getMetadataProviderAvailability: {
				queryOptions: () => ({
					queryKey: ["metadata-provider-availability"],
					queryFn: async () => providerAvailability,
				}),
			},
		},
		settings: {
			getAmazon: {
				queryOptions: () => ({
					queryKey: ["amazon"],
					queryFn: async () => ({ domain: "com" }),
				}),
			},
		},
	},
}));
const { MetadataSection } = await import("./metadata-section");
afterEach(() => {
	cleanup();
	providerAvailability = {
		ranobedb: true,
		amazon: false,
		googlebooks: true,
		openlibrary: true,
		goodreads: true,
		hardcover: true,
		comicvine: true,
	};
});

function mountSection() {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<MetadataSection
				library={{
					mediaType: "ebook",
					metadataProviders: {
						order: [
							"ranobedb",
							"amazon",
							"googlebooks",
							"openlibrary",
							"goodreads",
							"hardcover",
							"comicvine",
						],
					},
					metadataConfig: {},
				}}
				canManage={true}
			/>
		</QueryClientProvider>,
	);
}

test("toggling a provider marks the section as dirty", async () => {
	const view = mountSection();
	await waitFor(() =>
		expect(
			view.getByRole("checkbox", {
				name: m["library.provider_enable"]({ name: "Goodreads" }),
			}),
		).toBeTruthy(),
	);
	fireEvent.click(
		view.getByRole("checkbox", {
			name: m["library.provider_enable"]({ name: "Goodreads" }),
		}),
	);
	await waitFor(() =>
		expect(view.getByText(m["library.rules_unsaved"]())).toBeTruthy(),
	);
});
