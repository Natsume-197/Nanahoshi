import "@/test-utils/setup-dom";
import { afterEach, expect, test } from "bun:test";
import { listInputFromSearch, type TraySearch } from "./filters";
import { useMatchSelection } from "./use-match-selection";

const { cleanup, act, renderHook } = await import("@testing-library/react");
afterEach(cleanup);

function scopeKey(search: TraySearch) {
	const {
		sort: _sort,
		limit: _limit,
		offset: _offset,
		...scope
	} = listInputFromSearch(search);
	return JSON.stringify(scope);
}

test("selection survives paging/sorting but clears on a different search or library", () => {
	const { result, rerender } = renderHook(
		({ search }: { search: TraySearch }) => useMatchSelection(scopeKey(search)),
		{ initialProps: { search: {} } },
	);
	act(() => {
		result.current.setRowSelection({ book1: true });
		result.current.setSelectAllFilter(true);
	});
	rerender({ search: { page: 2, sort: "title.asc" } });
	expect(result.current.rowSelection).toEqual({ book1: true });
	expect(result.current.selectAllFilter).toBe(true);
	rerender({ search: { q: "different" } });
	expect(result.current.rowSelection).toEqual({});
	expect(result.current.selectAllFilter).toBe(false);
	act(() => result.current.setRowSelection({ book2: true }));
	rerender({ search: { library: "another-library" } });
	expect(result.current.rowSelection).toEqual({});
});
