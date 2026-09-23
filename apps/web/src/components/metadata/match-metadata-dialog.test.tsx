import "@/test-utils/setup-dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";

const invalidate = mock(async () => {});
mock.module("@tanstack/react-router", () => ({
	useRouter: () => ({ invalidate }),
	Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));
mock.module("sonner", () => ({
	toast: {
		error: mock(() => {}),
		info: mock(() => {}),
		success: mock(() => {}),
	},
}));
mock.module("@/utils/orpc", () => ({
	client: {},
	orpc: {},
	queryClient: { setQueryData: () => {}, invalidateQueries: () => {} },
}));
mock.module("@/components/ui/modal", () => ({
	Modal: ({
		children,
		onSubmit,
	}: {
		children: ReactNode;
		onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
	}) => <form onSubmit={onSubmit}>{children}</form>,
}));

const { cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
const { FixMatchDialog } = await import("./match-metadata-dialog");

afterEach(cleanup);

function mount(props: Partial<Parameters<typeof FixMatchDialog>[0]> = {}) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	return render(
		<QueryClientProvider client={queryClient}>
			<FixMatchDialog
				open
				onOpenChange={() => {}}
				providers={[
					{ id: "one", label: "One" },
					{ id: "two", label: "Two" },
				]}
				initialTitle="Dune"
				coverClass="size-12"
				fallbackIcon={null}
				search={async () => []}
				apply={async () => true}
				searchKey={["books", "book-1"]}
				{...props}
			/>
		</QueryClientProvider>,
	);
}

describe("FixMatchDialog provider collaboration", () => {
	test("keeps successful federated results when one provider fails", async () => {
		const view = mount({
			search: async ({ provider }) => {
				if (provider === "two") throw new Error("rate limited");
				return [{ provider, providerId: "1", title: "Dune", metaLines: [] }];
			},
		});
		fireEvent.submit(view.container.querySelector("form") as HTMLFormElement);
		await waitFor(() => expect(view.getByText("Dune")).toBeTruthy());
		expect(view.getByText(/one.*1 result/i)).toBeTruthy();
		expect(view.getByText(/two.*rate limited/i)).toBeTruthy();
	});

	test("reports providers that completed without matches", async () => {
		const view = mount();
		fireEvent.submit(view.container.querySelector("form") as HTMLFormElement);
		await waitFor(() =>
			expect(view.getByText(/one.*no results/i)).toBeTruthy(),
		);
		expect(view.getByText(/two.*no results/i)).toBeTruthy();
	});

	test("previews a diff and applies only the selected fields", async () => {
		const apply = mock(async () => true);
		const view = mount({
			providers: [{ id: "one", label: "One" }],
			current: { title: "Local title", description: null },
			search: async () => [
				{
					provider: "one",
					providerId: "1",
					title: "Remote title",
					metaLines: [],
				},
			],
			preview: async () => ({
				metadata: { title: "Remote title", description: "Summary" },
				lockedFields: ["title"],
			}),
			apply,
		});
		fireEvent.submit(view.container.querySelector("form") as HTMLFormElement);
		await waitFor(() => expect(view.getByText("Remote title")).toBeTruthy());
		fireEvent.click(view.getByRole("button", { name: /use/i }));
		await waitFor(() => expect(view.getByText("Summary")).toBeTruthy());
		const boxes = view.getAllByRole("checkbox") as HTMLInputElement[];
		expect(boxes.map((box) => box.checked)).toEqual([false, true]);
		expect(boxes.map((box) => box.disabled)).toEqual([true, false]);
		fireEvent.click(view.getByRole("button", { name: /use/i }));
		await waitFor(() => expect(apply).toHaveBeenCalled());
		expect(apply.mock.calls[0]?.[1]).toEqual(["description"]);
	});

	test("searches with the known title as soon as it opens", async () => {
		const search = mock(async ({ provider }: { provider: string }) => [
			{
				provider,
				providerId: "1",
				title: `Dune via ${provider}`,
				metaLines: [],
			},
		]);
		const view = mount({ search });
		await waitFor(() => expect(view.getByText("Dune via one")).toBeTruthy());
		expect(view.getByText("Dune via two")).toBeTruthy();
		expect(search).toHaveBeenCalledTimes(2);
		expect(search.mock.calls[0]?.[0]).toMatchObject({ title: "Dune" });
	});

	test("lists the matcher's candidates first and never twice", async () => {
		const view = mount({
			providers: [{ id: "one", label: "One" }],
			suggestions: [
				{
					provider: "one",
					providerId: "1",
					title: "Dune (1965)",
					metaLines: [],
				},
				// Not offered here any more, so it could not be applied.
				{ provider: "gone", providerId: "9", title: "Orphan", metaLines: [] },
			],
			search: async () => [
				{
					provider: "one",
					providerId: "1",
					title: "Dune again",
					metaLines: [],
				},
				{
					provider: "one",
					providerId: "2",
					title: "Dune Messiah",
					metaLines: [],
				},
			],
		});
		expect(view.getByText("Dune (1965)")).toBeTruthy();
		expect(view.queryByText("Orphan")).toBeNull();
		await waitFor(() => expect(view.getByText("Dune Messiah")).toBeTruthy());
		expect(view.queryByText("Dune again")).toBeNull();
	});
});
