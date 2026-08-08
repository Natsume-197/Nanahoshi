import {
	columnFilteringFeature,
	createFilteredRowModel,
	createPaginatedRowModel,
	createSortedRowModel,
	filterFn_includesString,
	rowPaginationFeature,
	rowSortingFeature,
	sortFn_alphanumeric,
	sortFn_basic,
	sortFn_datetime,
	sortFn_text,
	tableFeatures,
} from "@tanstack/react-table";

/**
 * The one feature set every admin table shares. Sorting, single-column text
 * filtering and pagination are the only behaviours any table here uses, so
 * nothing else is registered — unregistered features are tree-shaken and their
 * state slices never exist.
 *
 * The `sortFns`/`filterFns` registries only carry what `"auto"` resolution can
 * land on for our column value types: strings and dates. Anything else falls
 * back to the built-in basic sort.
 */
export const dataTableFeatures = tableFeatures({
	columnFilteringFeature,
	filteredRowModel: createFilteredRowModel(),
	filterFns: { includesString: filterFn_includesString },
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
	sortFns: {
		alphanumeric: sortFn_alphanumeric,
		basic: sortFn_basic,
		datetime: sortFn_datetime,
		text: sortFn_text,
	},
	rowPaginationFeature,
	paginatedRowModel: createPaginatedRowModel(),
});

export type DataTableFeatures = typeof dataTableFeatures;

/**
 * Brands the shared feature set with one table's `meta` type. v9 strips the
 * phantom `tableMeta` slot at runtime, so every table still registers the exact
 * same features — only the type of `table.options.meta` differs.
 *
 * Call at module scope: the returned object must stay referentially stable.
 */
export function defineTableFeatures<TMeta extends object>() {
	return tableFeatures({ ...dataTableFeatures, tableMeta: {} as TMeta });
}
