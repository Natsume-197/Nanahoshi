import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";

const { cleanup, fireEvent, render } = await import("@testing-library/react");

import { CreateLibraryInputSchema } from "@nanahoshi/api/routers/libraries/library.model";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { m } from "@/paraglide/messages";

const update = mock(() => Promise.resolve());
mock.module("@/utils/orpc", () => ({
	queryClient: new QueryClient(),
	orpc: {
		libraries: {
			updateLibrary: { mutationOptions: () => ({ mutationFn: update }) },
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
afterEach(cleanup);

function mountWizard() {
	const submit = mock((_data: unknown) => {});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<QueryClientProvider client={queryClient}>
			<CreateLibraryWizard
				inline
				open
				onOpenChange={() => {}}
				onSubmit={submit}
				isPending={false}
			/>
		</QueryClientProvider>,
	);
	const next = () =>
		fireEvent.click(
			view.getByRole("button", { name: m["library.next"](), exact: true }),
		);
	const back = () =>
		fireEvent.click(
			view.getByRole("button", { name: m["library.back"](), exact: true }),
		);
	return { view, submit, next, back };
}

test("collects providers and scanning before a single creation, preserving edits on back", () => {
	const { view, submit, next, back } = mountWizard();
	expect(view.queryByRole("dialog")).toBeNull();
	fireEvent.change(view.getByLabelText(m["library.name"]()), {
		target: { value: "My books" },
	});
	next();
	fireEvent.change(view.getByLabelText(m["library.source_folder"]()), {
		target: { value: "/books" },
	});
	next();
	fireEvent.click(
		view.getByRole("switch", {
			name: m["library.provider_enable"]({ name: "Amazon" }),
		}),
	);
	next();
	fireEvent.click(
		view.getByRole("switch", { name: m["library.toggle_realtime_watch"]() }),
	);
	fireEvent.click(
		view.getByRole("switch", { name: m["library.toggle_scheduled"]() }),
	);
	back();
	expect(
		view
			.getByRole("switch", {
				name: m["library.provider_enable"]({ name: "Amazon" }),
			})
			.getAttribute("aria-checked"),
	).toBe("false");
	next();
	next();
	expect(submit).not.toHaveBeenCalled();
	expect(update).not.toHaveBeenCalled();
	fireEvent.click(
		view.getByRole("button", { name: m["library.create_and_scan"]() }),
	);
	expect(submit).toHaveBeenCalledTimes(1);
	const data = CreateLibraryInputSchema.parse(submit.mock.calls[0]?.[0]);
	expect(data.paths).toEqual(["/books"]);
	expect(data.realtimeWatchEnabled).toBe(false);
	expect(data.isCronWatch).toBe(true);
	expect(data.scanIntervalMinutes).toBe(1440);
	expect(Array.isArray(data.metadataProviders)).toBe(false);
	if (!Array.isArray(data.metadataProviders)) {
		expect(data.metadataProviders?.order).not.toContain("amazon");
		expect(data.metadataProviders?.primary).toBe("googlebooks");
	}
});

test("switching media type uses audiobook providers and permits a library without folders", () => {
	const { view, submit, next, back } = mountWizard();
	fireEvent.change(view.getByLabelText(m["library.name"]()), {
		target: { value: "Audio" },
	});
	next();
	next();
	back();
	back();
	fireEvent.click(
		view.getByRole("button", {
			name: new RegExp(m["library.type_audiobooks"]()),
		}),
	);
	next();
	next();
	expect(
		view.queryByRole("switch", {
			name: m["library.provider_enable"]({ name: "Amazon" }),
		}),
	).toBeNull();
	expect(
		view.getByRole("switch", {
			name: m["library.provider_enable"]({ name: "Audible" }),
		}),
	).toBeTruthy();
	next();
	next();
	fireEvent.click(
		view.getByRole("button", { name: m["library.create_without_folder"]() }),
	);
	const data = CreateLibraryInputSchema.parse(submit.mock.calls[0]?.[0]);
	expect(data.mediaType).toBe("audiobook");
	expect(data.paths).toEqual([]);
	expect(data.metadataConfig).toEqual({ audible: { region: "us" } });
	if (!Array.isArray(data.metadataProviders))
		expect(data.metadataProviders?.order).toEqual(["audible", "itunes"]);
});
