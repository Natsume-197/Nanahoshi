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

// Role queries by accessible name cost ~0.5s each on this tree in jsdom.
function queryProviderCheckbox(
	view: { baseElement: HTMLElement },
	name: string,
): HTMLElement | null {
	const label = m["library.provider_enable"]({ name });
	return view.baseElement.querySelector<HTMLElement>(
		`[role="checkbox"][aria-label="${label}"]`,
	);
}

function getProviderCheckbox(
	view: { baseElement: HTMLElement },
	name: string,
): HTMLElement {
	const checkbox = queryProviderCheckbox(view, name);
	if (!checkbox) throw new Error(`No checkbox for provider ${name}`);
	return checkbox;
}

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
		expect(getProviderCheckbox(view, "Goodreads")).toBeTruthy(),
	);
	fireEvent.click(getProviderCheckbox(view, "Goodreads"));
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
	fireEvent.click(getProviderCheckbox(view, "Goodreads"));
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
	const { act } = await import("@testing-library/react");
	// Inside act so the follow-up updates don't each log an act() warning —
	// building those stacks cost seconds and timed the test out on CI.
	await act(async () => {
		fireEvent.click(getProviderCheckbox(view, "Goodreads"));
	});
	await act(async () => {
		client.setQueryData(
			["metadata-provider-availability"],
			providerAvailability,
		);
	});
	await waitFor(() => expect(queryProviderCheckbox(view, "Amazon")).toBeNull());
	expect(
		getProviderCheckbox(view, "Goodreads").getAttribute("aria-checked"),
	).toBe("false");
	expect(draft.mock.calls.at(-1)?.[0]).toMatchObject({
		metadataProviders: { order: ["ranobedb"] },
	});
	view.unmount();
	client.clear();
});
