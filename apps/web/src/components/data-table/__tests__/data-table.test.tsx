import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it } from "bun:test";
import { createColumnHelper, useTable } from "@tanstack/react-table";
import {
	act,
	cleanup,
	fireEvent,
	render,
	within,
} from "@testing-library/react";
import { DataTable } from "../data-table";
import { DataTableColumnHeader } from "../data-table-column-header";
import {
	type DataTableFeatures,
	dataTableFeatures,
	defineTableFeatures,
} from "../table-features";

afterEach(cleanup);

type Row = { id: string; name: string; email: string };

const rows: Row[] = [
	{ id: "1", name: "Charlie", email: "charlie@example.com" },
	{ id: "2", name: "alice", email: "alice@example.com" },
	{ id: "3", name: "Bob", email: "bob@example.com" },
];

const helper = createColumnHelper<DataTableFeatures, Row>();

const columns = helper.columns([
	helper.accessor("name", {
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Name" />
		),
		cell: ({ row }) => <span>{row.original.name}</span>,
	}),
	helper.accessor("email", {
		header: ({ column }) => (
			<DataTableColumnHeader column={column} title="Email" />
		),
	}),
	helper.display({
		id: "actions",
		cell: () => <button type="button">Go</button>,
	}),
]);

/** First cell of every body row, i.e. the name column. */
function bodyNames(container: HTMLElement) {
	const body = container.querySelector("tbody");
	return Array.from(body?.querySelectorAll("tr") ?? []).map(
		(tr) => tr.querySelector("td")?.textContent ?? "",
	);
}

describe("dataTableFeatures", () => {
	it("registers only the features the product uses", () => {
		expect(Object.keys(dataTableFeatures).sort()).toEqual([
			"columnFilteringFeature",
			"filterFns",
			"filteredRowModel",
			"paginatedRowModel",
			"rowPaginationFeature",
			"rowSortingFeature",
			"sortFns",
			"sortedRowModel",
		]);
	});

	it("registers the sort fns that `auto` resolution can land on", () => {
		expect(Object.keys(dataTableFeatures.sortFns).sort()).toEqual([
			"alphanumeric",
			"basic",
			"datetime",
			"text",
		]);
	});

	it("brands the shared feature set with a per-table meta, leaving runtime features identical", () => {
		const branded = defineTableFeatures<{ orgId: string }>();

		// `tableMeta` is a phantom slot: type-only, ignored at runtime.
		expect(Object.keys(branded.tableMeta)).toHaveLength(0);
		expect(
			Object.keys(branded)
				.filter((key) => key !== "tableMeta")
				.sort(),
		).toEqual(Object.keys(dataTableFeatures).sort());
	});
});

describe("DataTable markup", () => {
	it("renders semantic table elements with column scopes", () => {
		const { container } = render(
			<DataTable
				features={dataTableFeatures}
				columns={columns}
				data={rows}
				tableLabel="People"
			/>,
		);

		const table = within(container).getByRole("table", { name: "People" });
		expect(table.tagName).toBe("TABLE");
		expect(table.querySelector("thead")).not.toBeNull();
		expect(table.querySelector("tbody")).not.toBeNull();

		const headers = Array.from(table.querySelectorAll("th"));
		expect(headers).toHaveLength(3);
		for (const th of headers) {
			expect(th.getAttribute("scope")).toBe("col");
		}
	});

	it("exposes aria-sort on sortable columns only", () => {
		const { container } = render(
			<DataTable features={dataTableFeatures} columns={columns} data={rows} />,
		);

		const [name, email, actions] = Array.from(container.querySelectorAll("th"));
		expect(name?.getAttribute("aria-sort")).toBe("none");
		expect(email?.getAttribute("aria-sort")).toBe("none");
		// Display columns have no accessor, so they are not sortable.
		expect(actions?.getAttribute("aria-sort")).toBeNull();
	});

	it("renders the empty state when there are no rows", () => {
		const { container } = render(
			<DataTable
				features={dataTableFeatures}
				columns={columns}
				data={[]}
				emptyState={{ title: "Nobody", description: "No people yet." }}
			/>,
		);

		expect(within(container).getByText("No people yet.")).toBeDefined();
		expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
	});

	it("renders skeleton rows while loading instead of the empty state", () => {
		const { container } = render(
			<DataTable
				features={dataTableFeatures}
				columns={columns}
				data={[]}
				isLoading
				emptyState={{ description: "No people yet." }}
			/>,
		);

		expect(within(container).queryByText("No people yet.")).toBeNull();
		expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
		// One skeleton cell per leaf column.
		expect(container.querySelectorAll("tbody tr")[0]?.children).toHaveLength(3);
	});
});

describe("DataTable sorting", () => {
	it("sorts through the header and flips aria-sort", () => {
		const { container } = render(
			<DataTable features={dataTableFeatures} columns={columns} data={rows} />,
		);
		const nameHeader = within(container).getByRole("button", { name: /Name/ });

		expect(bodyNames(container)).toEqual(["Charlie", "alice", "Bob"]);

		fireEvent.click(nameHeader);
		expect(bodyNames(container)).toEqual(["alice", "Bob", "Charlie"]);
		expect(container.querySelectorAll("th")[0]?.getAttribute("aria-sort")).toBe(
			"ascending",
		);

		fireEvent.click(nameHeader);
		expect(bodyNames(container)).toEqual(["Charlie", "Bob", "alice"]);
		expect(container.querySelectorAll("th")[0]?.getAttribute("aria-sort")).toBe(
			"descending",
		);
	});
});

describe("DataTable filtering", () => {
	// The search box itself is not exercised here: React's `onChange` never fires
	// under this jsdom harness (reproducible with a plain useState input), so the
	// filtering contract is asserted against the table API instead.
	it("renders a search box bound to the searched column", () => {
		const { container } = render(
			<DataTable
				features={dataTableFeatures}
				columns={columns}
				data={rows}
				searchColumn="email"
				searchPlaceholder="Filter"
			/>,
		);

		expect(within(container).getByPlaceholderText("Filter")).toBeDefined();
		expect(bodyNames(container)).toHaveLength(3);
	});

	it("filters through the registered `auto` filter fn", () => {
		let table!: ReturnType<typeof useTable<DataTableFeatures, Row>>;
		function Probe() {
			table = useTable({ features: dataTableFeatures, data: rows, columns });
			return <span>{table.getRowModel().rows.length}</span>;
		}
		render(<Probe />);

		expect(table.getRowModel().rows).toHaveLength(3);

		// `filterFn: "auto"` on a string column resolves to the registered
		// `includesString`; an unregistered fn would silently match everything.
		act(() => table.getColumn("email")?.setFilterValue("bob@"));

		expect(table.getRowModel().rows).toHaveLength(1);
		expect(table.getRowModel().rows[0]?.original.name).toBe("Bob");

		// Clearing auto-removes the filter entry rather than matching nothing.
		act(() => table.getColumn("email")?.setFilterValue(""));
		expect(table.getRowModel().rows).toHaveLength(3);
	});
});

describe("DataTable pagination", () => {
	it("paginates and steps between pages", () => {
		const { container } = render(
			<DataTable
				features={dataTableFeatures}
				columns={columns}
				data={rows}
				pageSize={2}
			/>,
		);

		expect(bodyNames(container)).toEqual(["Charlie", "alice"]);

		const next = within(container).getByRole("button", { name: "Next page" });
		const previous = within(container).getByRole("button", {
			name: "Previous page",
		});
		expect((previous as HTMLButtonElement).disabled).toBe(true);

		fireEvent.click(next);
		expect(bodyNames(container)).toEqual(["Bob"]);
		expect((next as HTMLButtonElement).disabled).toBe(true);

		fireEvent.click(previous);
		expect(bodyNames(container)).toEqual(["Charlie", "alice"]);
	});

	it("hides the pager when everything fits on one page", () => {
		const { container } = render(
			<DataTable features={dataTableFeatures} columns={columns} data={rows} />,
		);

		expect(
			within(container).queryByRole("button", { name: "Next page" }),
		).toBeNull();
	});
});

describe("DataTable meta", () => {
	it("hands per-table meta to cell renderers", () => {
		const features = defineTableFeatures<{ label: string }>();
		const metaHelper = createColumnHelper<typeof features, Row>();
		const metaColumns = metaHelper.columns([
			metaHelper.accessor("name", {
				cell: ({ row, table }) => (
					<span>{`${table.options.meta?.label}:${row.original.name}`}</span>
				),
			}),
		]);

		const { container } = render(
			<DataTable
				features={features}
				columns={metaColumns}
				data={rows.slice(0, 1)}
				meta={{ label: "user" }}
			/>,
		);

		expect(within(container).getByText("user:Charlie")).toBeDefined();
	});
});
