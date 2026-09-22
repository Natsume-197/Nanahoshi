import type { RowSelectionState } from "@tanstack/react-table";
import { useState } from "react";

/** Selection belongs to a filter scope; paging and sorting preserve it. */
export function useMatchSelection(scopeKey: string) {
	const [previousScope, setPreviousScope] = useState(scopeKey);
	const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
	const [selectAllFilter, setSelectAllFilter] = useState(false);
	if (scopeKey !== previousScope) {
		setPreviousScope(scopeKey);
		setRowSelection({});
		setSelectAllFilter(false);
	}
	const clearSelection = () => {
		setRowSelection({});
		setSelectAllFilter(false);
	};
	return {
		rowSelection,
		setRowSelection,
		selectAllFilter,
		setSelectAllFilter,
		clearSelection,
	};
}
