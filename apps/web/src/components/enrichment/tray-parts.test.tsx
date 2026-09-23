import "@/test-utils/setup-dom";
import { afterEach, describe, expect, mock, test } from "bun:test";
import { m } from "@/paraglide/messages";

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { TrayBulkBar, TrayPagination } = await import("./tray-parts");

afterEach(cleanup);

describe("TrayBulkBar", () => {
	test("offers the whole result set only when asked to", () => {
		const onSelectAll = mock(() => {});
		const onClear = mock(() => {});
		const view = render(
			<TrayBulkBar
				count={10}
				total={42}
				offerSelectAll
				onSelectAll={onSelectAll}
				onClear={onClear}
				busy={false}
			>
				<button type="button">Approve</button>
			</TrayBulkBar>,
		);
		fireEvent.click(
			view.getByText(m["enrichment.select_all_results"]({ count: 42 })),
		);
		fireEvent.click(view.getByText(m["enrichment.clear_selection"]()));
		expect(onSelectAll).toHaveBeenCalledTimes(1);
		expect(onClear).toHaveBeenCalledTimes(1);
		expect(view.getByText("Approve")).toBeTruthy();
	});
});

describe("TrayPagination", () => {
	test("reports the range and pages by number", () => {
		const onPageChange = mock((_page: number) => {});
		const view = render(
			<TrayPagination
				offset={10}
				pageSize={10}
				total={25}
				currentPage={2}
				totalPages={3}
				onPageChange={onPageChange}
			/>,
		);
		expect(
			view.getByText(
				m["enrichment.showing_range"]({ from: 11, to: 20, total: 25 }),
			),
		).toBeTruthy();
		fireEvent.click(view.getByLabelText(m["enrichment.next_page"]()));
		fireEvent.click(
			view.getByLabelText(m["enrichment.go_to_page"]({ page: 1 })),
		);
		expect(onPageChange.mock.calls.map(([page]) => page)).toEqual([3, 1]);
	});

	test("hides page controls for a single page", () => {
		const view = render(
			<TrayPagination
				offset={0}
				pageSize={10}
				total={4}
				currentPage={1}
				totalPages={1}
				onPageChange={() => {}}
			/>,
		);
		expect(view.queryByLabelText(m["enrichment.next_page"]())).toBeNull();
	});
});
