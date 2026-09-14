import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";

const { cleanup, render, waitFor } = await import("@testing-library/react");

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";

const providerAvailability: Record<string, boolean> = {
	ranobedb: true,
	amazon: true,
	googlebooks: true,
	openlibrary: true,
	goodreads: true,
	hardcover: false,
	comicvine: true,
};
mock.module("@/utils/orpc", () => ({
	queryClient: new QueryClient(),
	orpc: {
		libraries: {
			updateLibrary: {
				mutationOptions: () => ({ mutationFn: async () => ({}) }),
			},
			getMetadataProviderAvailability: {
				queryOptions: () => ({
					queryKey: ["debug-availability"],
					queryFn: async () => providerAvailability,
				}),
			},
		},
		settings: {
			getAmazon: {
				queryOptions: () => ({
					queryKey: ["debug-amazon"],
					queryFn: async () => ({ domain: "com" }),
				}),
			},
		},
	},
}));
const { MetadataSection } = await import("./library-detail/metadata-section");
afterEach(cleanup);

function mountSection(metadataProviders: unknown) {
	const onDirtyChange = mock((_dirty: boolean) => {});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<QueryClientProvider client={queryClient}>
			<MetadataSection
				library={{
					mediaType: "ebook",
					metadataProviders: metadataProviders as never,
					metadataConfig: {},
				}}
				canManage
				onDirtyChange={onDirtyChange}
			/>
		</QueryClientProvider>,
	);
	return { view, onDirtyChange };
}

test("debug A: no fields/paused", { timeout: 30000 }, async () => {
	const { view, onDirtyChange } = mountSection({
		order: ["googlebooks", "amazon", "hardcover"],
	});
	await waitFor(() =>
		expect(
			view.queryByRole("checkbox", {
				name: m["library.provider_enable"]({ name: "Hardcover" }),
			}),
		).toBeNull(),
	);
	console.log("A calls:", JSON.stringify(onDirtyChange.mock.calls));
});

test("debug B: with fields/paused", { timeout: 30000 }, async () => {
	const { view, onDirtyChange } = mountSection({
		order: ["googlebooks", "amazon", "hardcover"],
		fields: { cover: ["hardcover", "amazon"] },
		pausedFields: { description: ["hardcover"] },
	});
	await waitFor(() =>
		expect(
			view.queryByRole("checkbox", {
				name: m["library.provider_enable"]({ name: "Hardcover" }),
			}),
		).toBeNull(),
	);
	console.log("B calls:", JSON.stringify(onDirtyChange.mock.calls));
});
