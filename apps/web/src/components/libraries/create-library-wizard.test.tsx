import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";

const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);

import { CreateLibraryInputSchema } from "@nanahoshi/api/routers/libraries/library.model";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";
import {
	reorderProviderEntries,
	toProviderIds,
} from "./provider-priority-list";

const update = mock(() => Promise.resolve());
const allProvidersAvailable = {
	ranobedb: true,
	amazon: true,
	googlebooks: true,
	openlibrary: true,
	goodreads: true,
	hardcover: true,
	comicvine: true,
};
let providerAvailability = { ...allProvidersAvailable };
mock.module("@/utils/orpc", () => ({
	queryClient: new QueryClient(),
	orpc: {
		libraries: {
			updateLibrary: { mutationOptions: () => ({ mutationFn: update }) },
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
		files: {
			getDirectories: {
				queryOptions: () => ({
					queryKey: ["directories"],
					queryFn: async () => [],
				}),
			},
		},
	},
}));
const { CreateLibraryWizard } = await import("./create-library-wizard");
afterEach(() => {
	cleanup();
	providerAvailability = { ...allProvidersAvailable };
});

function mountWizard() {
	const submit = mock((_data: unknown) => {});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<QueryClientProvider client={queryClient}>
			<CreateLibraryWizard
				onOpenChange={() => {}}
				onSubmit={submit}
				isPending={false}
			/>
		</QueryClientProvider>,
	);
	const fillName = (value: string) =>
		fireEvent.change(view.getByLabelText(`${m["library.name"]()}*`), {
			target: { value },
		});
	const fillFolder = (value: string) =>
		fireEvent.change(
			view.getByLabelText(`${m["library.section_folders"]()}*`),
			{
				target: { value },
			},
		);
	const next = () =>
		fireEvent.click(
			view.getByRole("button", { name: m["library.next"](), exact: true }),
		);
	const back = () =>
		fireEvent.click(
			view.getByRole("button", { name: m["library.back"](), exact: true }),
		);
	const submitForm = () =>
		fireEvent.click(
			view.getByRole("button", {
				name: m["library.create_and_scan"](),
			}),
		);
	return { view, submit, fillName, fillFolder, next, back, submitForm };
}

test("reorders active providers while leaving inactive providers last", () => {
	const reordered = reorderProviderEntries(
		[
			{ id: "googlebooks", enabled: true },
			{ id: "amazon", enabled: true },
			{ id: "openlibrary", enabled: true },
			{ id: "ranobedb", enabled: false },
		],
		"openlibrary",
		"amazon",
	);
	expect(toProviderIds(reordered)).toEqual([
		"googlebooks",
		"openlibrary",
		"amazon",
	]);
	expect(reordered.at(-1)).toEqual({ id: "ranobedb", enabled: false });
});

test("does not offer providers disabled by the server", {
	timeout: 20000,
}, async () => {
	providerAvailability.amazon = false;
	const { view, fillName, fillFolder, next } = mountWizard();
	fillName("Server policy");
	fillFolder("/books");
	next();
	expect(
		view.queryByRole("combobox", { name: m["library.metadata_profile"]() }),
	).toBeNull();
	expect(
		view.getByRole("button", {
			name: m["library.provider_drag"]({ name: "Google Books" }),
		}),
	).toBeTruthy();

	await waitFor(() =>
		expect(
			view.getByRole("heading", {
				name: m["library.sources_priority_title"](),
			}),
		).toBeTruthy(),
	);
	await waitFor(() => {
		expect(
			view.queryByRole("checkbox", {
				name: m["library.provider_enable"]({ name: "Amazon" }),
			}),
		).toBeNull();
		expect(
			view.queryByRole("combobox", { name: m["library.amazon_store"]() }),
		).toBeNull();
	});
});

test("collects providers before a single creation, preserving edits on back", {
	timeout: 20000,
}, async () => {
	const { view, submit, fillName, fillFolder, next, back, submitForm } =
		mountWizard();
	expect(view.queryByRole("dialog")).toBeNull();
	fillName("My books");
	fillFolder("/books");
	next();
	expect(
		view.queryByRole("button", {
			name: m["library.provider_drag"]({ name: "RanobeDB" }),
		}),
	).toBeNull();
	expect(
		view.queryByRole("combobox", { name: m["library.amazon_store"]() }),
	).toBeNull();
	fireEvent.click(
		view.getByRole("button", { name: m["library.amazon_store"]() }),
	);
	expect(
		view.getByRole("combobox", { name: m["library.amazon_store"]() }),
	).toBeTruthy();
	fireEvent.click(view.getByRole("button", { name: m["common.close"]() }));
	fireEvent.click(
		view.getByRole("checkbox", {
			name: m["library.provider_enable"]({ name: "Goodreads" }),
		}),
	);
	expect(view.getByRole("table")).toBeTruthy();
	await waitFor(() =>
		expect(
			view.getByRole("heading", {
				name: m["library.field_routing_title"](),
			}),
		).toBeTruthy(),
	);
	back();
	expect(
		view.getByLabelText(`${m["library.section_folders"]()}*`),
	).toBeTruthy();
	next();
	expect(
		view
			.getByRole("checkbox", {
				name: m["library.provider_enable"]({ name: "Goodreads" }),
			})
			.getAttribute("aria-checked"),
	).toBe("false");
	await waitFor(() =>
		expect(
			view.getByRole("heading", {
				name: m["library.field_routing_title"](),
			}),
		).toBeTruthy(),
	);
	next();
	expect(view.getByText("My books")).toBeTruthy();
	expect(submit).not.toHaveBeenCalled();
	expect(update).not.toHaveBeenCalled();
	submitForm();
	await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
	const data = CreateLibraryInputSchema.parse(submit.mock.calls[0]?.[0]);
	expect(data.paths).toEqual(["/books"]);
	expect(data.realtimeWatchEnabled).toBe(true);
	expect(data.isCronWatch).toBe(false);
	expect(data.scanIntervalMinutes).toBeNull();
	expect(Array.isArray(data.metadataProviders)).toBe(false);
	if (!Array.isArray(data.metadataProviders)) {
		expect(data.metadataProviders?.order).not.toContain("goodreads");
		expect(data.metadataProviders?.primary).toBeUndefined();
		expect(data.metadataProviders?.profile).toBeUndefined();
		expect(data.metadataProviders?.fields).toEqual({});
	}
});

test("returns a creation error to the folder step", {
	timeout: 20000,
}, async () => {
	const { view, submit, fillName, fillFolder, next, submitForm } =
		mountWizard();
	const message = "Folder is not accessible on the server: /missing";
	submit.mockImplementation(() => Promise.reject(new Error(message)));
	fillName("My books");
	fillFolder("/missing");
	next();
	next();
	submitForm();
	await waitFor(() => expect(view.getByText(message)).toBeTruthy());
	expect(
		view.getByLabelText(`${m["library.section_folders"]()}*`),
	).toBeTruthy();
});

test("switching media type uses audiobook providers with a required folder", {
	timeout: 20000,
}, async () => {
	const { view, submit, fillName, fillFolder, next, submitForm } =
		mountWizard();
	fillName("Audio");
	fireEvent.click(
		view.getByRole("button", {
			name: new RegExp(m["library.type_audiobooks"]()),
		}),
	);
	fillFolder("/audiobooks");
	next();
	expect(
		view.queryByRole("checkbox", {
			name: m["library.provider_enable"]({ name: "Amazon" }),
		}),
	).toBeNull();
	expect(
		view.getByRole("checkbox", {
			name: m["library.provider_enable"]({ name: "Audible" }),
		}),
	).toBeTruthy();
	next();
	expect(view.getByText("Audio")).toBeTruthy();
	submitForm();
	const data = CreateLibraryInputSchema.parse(submit.mock.calls[0]?.[0]);
	expect(data.mediaType).toBe("audiobook");
	expect(data.paths).toEqual(["/audiobooks"]);
	expect(data.metadataConfig).toEqual({ audible: { region: "us" } });
	if (!Array.isArray(data.metadataProviders))
		expect(data.metadataProviders?.order).toEqual(["audible", "itunes"]);
});

test("blocks advancing without a name and without a folder", {
	timeout: 20000,
}, async () => {
	const { view, fillName, fillFolder, next } = mountWizard();
	next();
	expect(view.getByText(m["library.name_required"]())).toBeTruthy();
	expect(view.getByRole("button", { name: m["library.next"]() })).toBeTruthy();
	fillName("My books");
	next();
	expect(view.getByText(m["library.folder_required"]())).toBeTruthy();
	expect(
		view.getByLabelText(`${m["library.section_folders"]()}*`),
	).toBeTruthy();
	fillFolder("/books");
	next();
	await waitFor(() =>
		expect(
			view.getByRole("heading", {
				name: m["library.sources_priority_title"](),
			}),
		).toBeTruthy(),
	);
});

test("editing a legacy profile preserves its rules without locking a source", async () => {
	const { MetadataSection } = await import("./library-detail/metadata-section");
	const onDraftChange = mock((_draft: unknown) => {});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<QueryClientProvider client={queryClient}>
			<MetadataSection
				library={{
					mediaType: "ebook",
					metadataProviders: {
						order: ["googlebooks", "amazon"],
						primary: "googlebooks",
						profile: { id: "general", version: 1 },
						fields: { cover: ["amazon", "googlebooks"], description: [] },
					},
					metadataConfig: {},
				}}
				canManage
				onDraftChange={onDraftChange}
			/>
		</QueryClientProvider>,
	);
	await waitFor(() => expect(onDraftChange).toHaveBeenCalled());
	const draft = onDraftChange.mock.calls.at(-1)?.[0] as {
		metadataProviders: {
			fields: unknown;
			primary?: string;
			profile?: unknown;
			order: string[];
		};
	};
	expect(draft.metadataProviders.fields).toEqual({
		cover: ["amazon", "googlebooks"],
		description: [],
	});
	expect(draft.metadataProviders.primary).toBeUndefined();
	expect(draft.metadataProviders.profile).toBeUndefined();
	fireEvent.click(
		view.getByRole("checkbox", {
			name: m["library.provider_enable"]({ name: "Google Books" }),
		}),
	);
	await waitFor(() => {
		const next = onDraftChange.mock.calls.at(-1)?.[0] as typeof draft;
		expect(next.metadataProviders.order).toEqual(["amazon"]);
		expect(next.metadataProviders.fields).toEqual(
			draft.metadataProviders.fields,
		);
	});
});
