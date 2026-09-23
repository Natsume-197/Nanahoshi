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

test("draft and dirty notifications follow edits and data replacement", async () => {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	client.setQueryData(["metadata-provider-availability"], providerAvailability);
	const dirty = mock((_value: boolean) => {});
	const draft = mock((_value: unknown) => {});
	const library = {
		mediaType: "ebook" as const,
		metadataProviders: {
			order: ["ranobedb", "amazon", "goodreads"],
			fields: { title: ["amazon", "ranobedb"] },
		},
		metadataConfig: {},
	};
	const section = (value = library) => (
		<QueryClientProvider client={client}>
			<MetadataSection
				library={value}
				canManage
				onDirtyChange={dirty}
				onDraftChange={draft}
			/>
		</QueryClientProvider>
	);
	const view = render(section());
	await waitFor(() => expect(draft).toHaveBeenCalled());
	expect(dirty).toHaveBeenLastCalledWith(false);
	expect(draft.mock.calls.at(-1)?.[0]).toMatchObject({
		metadataProviders: {
			order: ["ranobedb", "goodreads"],
			fields: { title: ["ranobedb"] },
		},
	});
	fireEvent.click(
		view.getByRole("checkbox", {
			name: m["library.provider_enable"]({ name: "Goodreads" }),
		}),
	);
	expect(dirty).toHaveBeenLastCalledWith(true);
	expect(draft.mock.calls.at(-1)?.[0]).toMatchObject({
		metadataProviders: { order: ["ranobedb"] },
	});
	view.rerender(
		section({
			...library,
			metadataProviders: {
				...library.metadataProviders,
				order: ["ranobedb", "googlebooks"],
			},
		}),
	);
	expect(dirty).toHaveBeenLastCalledWith(false);
	expect(draft.mock.calls.at(-1)?.[0]).toMatchObject({
		metadataProviders: { order: ["ranobedb", "googlebooks"] },
	});
	view.unmount();
	expect(dirty).toHaveBeenLastCalledWith(false);
	client.clear();
});

test("provider availability updates preserve edits made while it was loading", async () => {
	const client = new QueryClient({
		defaultOptions: {
			queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
		},
	});
	client.setQueryData(["metadata-provider-availability"], {
		...providerAvailability,
		amazon: true,
	});
	const draft = mock((_value: unknown) => {});
	const view = render(
		<QueryClientProvider client={client}>
			<MetadataSection
				library={{
					mediaType: "ebook",
					metadataProviders: ["ranobedb", "amazon", "goodreads"],
					metadataConfig: {},
				}}
				canManage
				onDraftChange={draft}
			/>
		</QueryClientProvider>,
	);
	fireEvent.click(
		view.getByRole("checkbox", {
			name: m["library.provider_enable"]({ name: "Goodreads" }),
		}),
	);
	const { act } = await import("@testing-library/react");
	await act(async () => {
		client.setQueryData(
			["metadata-provider-availability"],
			providerAvailability,
		);
	});
	await waitFor(() =>
		expect(
			view.queryByRole("checkbox", {
				name: m["library.provider_enable"]({ name: "Amazon" }),
			}),
		).toBeNull(),
	);
	expect(
		view
			.getByRole("checkbox", {
				name: m["library.provider_enable"]({ name: "Goodreads" }),
			})
			.getAttribute("aria-checked"),
	).toBe("false");
	expect(draft.mock.calls.at(-1)?.[0]).toMatchObject({
		metadataProviders: { order: ["ranobedb"] },
	});
	view.unmount();
	client.clear();
});
