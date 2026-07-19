import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getLocale } from "@/paraglide/runtime";

/** Vertically stacked settings rows with the subtle separators used across server settings. */
export function SettingRows({ children }: { children: ReactNode }) {
	const rows = Children.toArray(children);

	return (
		<div className="flex flex-col">
			{rows.map((row, index) => (
				<Fragment
					key={isValidElement(row) && row.key !== null ? row.key : index}
				>
					{row}
					{index < rows.length - 1 && <Separator className="bg-border/60" />}
				</Fragment>
			))}
		</div>
	);
}

/** Label + value row for settings lists; pass `onEdit` to append an edit button. */
export function SettingRow({
	label,
	value,
	loading,
	onEdit,
	editLabel,
}: {
	label: string;
	value: string;
	loading?: boolean;
	onEdit?: () => void;
	editLabel?: string;
}) {
	return (
		<div className="flex items-center justify-between gap-8 py-3 first:pt-0 last:pb-0">
			<span className="shrink-0 text-foreground text-sm">{label}</span>
			<div className="flex min-w-0 items-center gap-3">
				{loading ? (
					<Skeleton className="h-5 w-24" />
				) : (
					<span className="min-w-0 truncate font-medium text-foreground text-sm">
						{value}
					</span>
				)}
				{onEdit && (
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="shrink-0"
						onClick={onEdit}
					>
						{editLabel}
					</Button>
				)}
			</div>
		</div>
	);
}

/** Description + control row used by full-width settings sections. */
export function SettingControlRow({
	label,
	description,
	children,
	controlClassName,
}: {
	label: ReactNode;
	description?: ReactNode;
	children: ReactNode;
	controlClassName?: string;
}) {
	return (
		<div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
			<div className="flex min-w-0 flex-col gap-1">
				{label}
				{description && (
					<p className="max-w-xl text-muted-foreground text-sm">
						{description}
					</p>
				)}
			</div>
			<div className={cn("w-full shrink-0 sm:w-auto", controlClassName)}>
				{children}
			</div>
		</div>
	);
}

export function SettingStatRow({
	label,
	value,
	loading,
}: {
	label: string;
	value: number;
	loading: boolean;
}) {
	return (
		<div className="flex items-center justify-between gap-8 py-3 first:pt-0 last:pb-0">
			<span className="text-foreground text-sm">{label}</span>
			<span className="font-medium text-foreground text-sm tabular-nums">
				{loading ? (
					<Skeleton as="span" className="inline-block h-5 w-10" />
				) : (
					new Intl.NumberFormat(getLocale()).format(value)
				)}
			</span>
		</div>
	);
}
