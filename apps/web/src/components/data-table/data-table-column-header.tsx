import { ArrowDown, ArrowsDownUp, ArrowUp } from "@phosphor-icons/react";
import type { Column } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DataTableColumnHeaderProps<TData, TValue>
	extends React.ComponentProps<"div"> {
	column: Column<TData, TValue>;
	title: string;
}

function DataTableColumnHeader<TData, TValue>({
	column,
	title,
	className,
}: DataTableColumnHeaderProps<TData, TValue>) {
	if (!column.getCanSort()) {
		return <div className={cn(className)}>{title}</div>;
	}

	return (
		<Button
			variant="ghost"
			size="sm"
			className={cn("-ml-2 h-8", className)}
			onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
		>
			{title}
			{column.getIsSorted() === "desc" ? (
				<ArrowDown data-icon="inline-end" />
			) : column.getIsSorted() === "asc" ? (
				<ArrowUp data-icon="inline-end" />
			) : (
				<ArrowsDownUp data-icon="inline-end" />
			)}
		</Button>
	);
}

export { DataTableColumnHeader };
