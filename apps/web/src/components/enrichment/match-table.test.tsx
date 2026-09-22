import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";
import type { RowSelectionState } from "@tanstack/react-table";
import { useState } from "react";
import { m } from "@/paraglide/messages";
import { MatchResults, useMatchTable } from "./match-table";
import type { MatchRow } from "./types";

const { cleanup, fireEvent, render } = await import("@testing-library/react");
afterEach(() => {
	cleanup();
	localStorage.clear();
});

const item: MatchRow = {
	bookUuid: "book-1",
	title: "Local book",
	filename: null,
	cover: null,
	mediaType: "ebook",
	libraryName: "Library",
	status: "pending",
	lifecycle: "review",
	matched: [{ provider: "test", title: "Matched book" }],
	decision: null,
	failures: [],
	lastRunAt: null,
	retry: undefined,
};

function mount(desktopTable: boolean) {
	const onOpen = mock(() => {});
	const onApprove = mock(() => {});
	const patchFilters = mock(() => {});
	const rowActions = () => ({
		onApprove,
		onRetry: () => {},
		onRefresh: () => {},
		onFix: () => {},
		onCancelRetry: () => {},
		onSelectCandidate: () => {},
	});
	function Harness() {
		const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
		const [selectAllFilter, setSelectAllFilter] = useState(false);
		const table = useMatchTable({
			items: [item],
			total: 1,
			page: 1,
			search: "",
			bucket: "all",
			detailUuid: null,
			providerLabels: {},
			rowSelection,
			setRowSelection,
			selectAllFilter,
			setSelectAllFilter,
			setSearch: () => {},
			applyScope: () => {},
			patchFilters,
			openDetail: onOpen,
			rowActions,
			onPageChange: () => {},
		});
		return (
			<MatchResults
				table={table}
				desktopTable={desktopTable}
				scopeLabel="Matches"
				isPlaceholderData={false}
				selectAllFilter={selectAllFilter}
				detailUuid={null}
				openDetail={onOpen}
				rowActions={rowActions}
				providerLabels={{}}
				setSelectAllFilter={setSelectAllFilter}
			/>
		);
	}
	return { ...render(<Harness />), onOpen, onApprove, patchFilters };
}

test("desktop table keeps selection, sorting and row actions after extraction", () => {
	localStorage.setItem("match-manager-table", '{"order":"broken"}');
	const view = mount(true);
	expect(view.getByRole("table", { name: "Matches" })).toBeTruthy();
	const select = view.getByRole("checkbox", { name: "Local book" });
	fireEvent.click(select);
	expect(
		view
			.getByRole("checkbox", { name: "Local book" })
			.getAttribute("aria-checked"),
	).toBe("true");
	fireEvent.click(
		view.getByText(m["enrichment.col_book"](), { selector: "button" }),
	);
	expect(view.patchFilters).toHaveBeenCalled();
	fireEvent.click(view.getByText(m["enrichment.approve"]()));
	expect(view.onApprove).toHaveBeenCalledTimes(1);
	expect(view.onOpen).not.toHaveBeenCalled();
	fireEvent.click(view.getByText("Local book"));
	expect(view.onOpen).toHaveBeenCalledTimes(1);
});

test("mobile cards expose the same detail and approval actions", () => {
	const view = mount(false);
	fireEvent.click(view.getByText("Local book"));
	expect(view.onOpen).toHaveBeenCalledTimes(1);
	fireEvent.click(view.getByText(m["enrichment.approve"]()));
	expect(view.onApprove).toHaveBeenCalledTimes(1);
});
