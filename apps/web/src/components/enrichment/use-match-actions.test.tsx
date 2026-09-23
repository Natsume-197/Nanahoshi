import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { m } from "@/paraglide/messages";

const approve = mock(async (_input: unknown) => ({}));
const restoreOriginal = mock(async (_input: unknown) => ({}));
let resolvePreview: (value: {
	total: number;
	byProvider: Record<string, number>;
	byReason: Record<string, number>;
	samples: [];
}) => void;
const approvalPreview = mock(
	(_input: unknown) =>
		new Promise((resolve) => {
			resolvePreview = resolve;
		}),
);
const api = {
	enrichment: {
		approve,
		restoreOriginal,
		approvalPreview,
		retry: async () => ({}),
		cancelRetry: async () => ({}),
		resolveProviderFailures: async () => ({}),
		list: async () => ({}),
		actionableCounts: async () => ({}),
		providerStatus: async () => ({}),
		detail: async () => null,
	},
	libraries: {
		setAutoEnrichPaused: async () => ({}),
		setAllAutoEnrichPaused: async () => ({}),
		getLibrariesOverview: async () => [],
	},
};
mock.module("@/utils/orpc", () => ({
	client: api,
	orpc: createTanstackQueryUtils(api),
}));
mock.module("@/components/metadata/match-metadata-dialog", () => ({
	BookMatchDialog: () => null,
	AudiobookMatchDialog: () => null,
}));
mock.module("@/components/ui/modal", () => ({
	Modal: ({ open, children }: { open: boolean; children: ReactNode }) =>
		open ? <div role="dialog">{children}</div> : null,
}));
mock.module("sonner", () => ({
	toast: { success: () => {}, error: () => {}, info: () => {} },
}));
const { cleanup, fireEvent, render, waitFor, act } = await import(
	"@testing-library/react"
);
const { useMatchActions } = await import("./use-match-actions");
afterEach(() => {
	cleanup();
	approve.mockClear();
	decided.mockClear();
	restoreOriginal.mockClear();
});

const decided = mock((_uuid: string) => {});

function mount() {
	const queryClient = new QueryClient({
		defaultOptions: { mutations: { retry: false } },
	});
	function Harness({ uuid }: { uuid: string }) {
		const actions = useMatchActions({
			libraryUuid: "library",
			providerLabels: {},
			cooldowns: [],
			failureBanners: [],
			failingBooks: 0,
			clearSelection: () => {},
			onDecided: decided,
		});
		return (
			<>
				<button
					type="button"
					disabled={actions.busy}
					onClick={() => actions.previewApproval({ bookUuids: [uuid] })}
				>
					Preview
				</button>
				<button
					type="button"
					onClick={() => actions.requestRestore({ bookUuids: [uuid] }, 1)}
				>
					Restore
				</button>
				<button
					type="button"
					onClick={() =>
						actions
							.rowActions({ bookUuid: uuid } as Parameters<
								typeof actions.rowActions
							>[0])
							.onApprove()
					}
				>
					Approve one
				</button>
				{actions.dialogs}
			</>
		);
	}
	const tree = (uuid: string) => (
		<QueryClientProvider client={queryClient}>
			<Harness uuid={uuid} />
		</QueryClientProvider>
	);
	const view = render(tree("original"));
	return { ...view, changeSelection: () => view.rerender(tree("different")) };
}

test("approval confirms the input that was previewed even if selection changes during the request", async () => {
	const view = mount();
	fireEvent.click(view.getByText("Preview"));
	await waitFor(() =>
		expect(view.getByText("Preview").hasAttribute("disabled")).toBe(true),
	);
	view.changeSelection();
	await act(async () =>
		resolvePreview({ total: 1, byProvider: {}, byReason: {}, samples: [] }),
	);
	fireEvent.click(await view.findByText(m["enrichment.approve"]()));
	await waitFor(() =>
		expect(approve).toHaveBeenCalledWith(
			{ bookUuids: ["original"] },
			expect.anything(),
		),
	);
});

test("restore confirms the original selection", async () => {
	const view = mount();
	fireEvent.click(view.getByText("Restore"));
	view.changeSelection();
	fireEvent.click(view.getByText(m["enrichment.restore_original"]()));
	await waitFor(() =>
		expect(restoreOriginal).toHaveBeenCalledWith(
			{ bookUuids: ["original"] },
			expect.anything(),
		),
	);
});

test("approving one book tells the pane to move on from it", async () => {
	const view = mount();
	fireEvent.click(view.getByText("Approve one"));
	await waitFor(() => expect(decided).toHaveBeenCalledWith("original"));
});
