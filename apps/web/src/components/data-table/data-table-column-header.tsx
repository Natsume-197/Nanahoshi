import { ArrowDown, ArrowsDownUp, ArrowUp } from "@phosphor-icons/react";
import type { Column, RowData } from "@tanstack/react-table";
import type { DataTableFeatures } from "@/components/data-table/table-features";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<
	TFeatures extends DataTableFeatures,
	TData extends RowData,
	TValue,
> extends React.ComponentProps<"div"> {
	column: Column<TFeatures, TData, TValue>;
	title: string;
}

function DataTableColumnHeader<
	TFeatures extends DataTableFeatures,
	TData extends RowData,
	TValue,
>({
	column: genericColumn,
	title,
	className,
}: DataTableColumnHeaderProps<TFeatures, TData, TValue>) {
	// Same reason as DataTable: the sorting APIs only resolve on the concrete
	// feature set, and the phantom `tableMeta` slot is all that varies.
	const column = genericColumn as unknown as Column<
		DataTableFeatures,
		TData,
		TValue
	>;

	if (!column.getCanSort()) {
		return <div className={cn(className)}>{title}</div>;
	}

	const sorted = column.getIsSorted();

	return (
		<Button
			variant="ghost"
			size="sm"
			className={cn("-ml-2 h-8", className)}
			onClick={() => column.toggleSorting(sorted === "asc")}
		>
			{title}
			{sorted === "desc" ? (
				<ArrowDown data-icon="inline-end" />
			) : sorted === "asc" ? (
				<ArrowUp data-icon="inline-end" />
			) : (
				<ArrowsDownUp data-icon="inline-end" />
			)}
		</Button>
	);
}

export { DataTableColumnHeader };
