import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getLocale } from "@/paraglide/runtime";

/** Vertically stacked settings rows grouped by spacing rather than repeated rules. */
export function SettingRows({ children }: { children: ReactNode }) {
	return <div className="flex flex-col gap-2">{children}</div>;
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
		<div className="flex flex-col items-start gap-1.5 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
			<span className="text-foreground text-sm">{label}</span>
			<div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
				{loading ? (
					<Skeleton className="h-5 w-24" />
				) : (
					<span className="min-w-0 break-words font-medium text-foreground text-sm sm:text-end">
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
		// The container has to be an ancestor: a container query never matches the
		// element that declares it, so the flex-row variants must live one level in.
		<div className="@container/settings-row py-4 first:pt-0 last:pb-0">
			<div className="flex @xl/settings-row:flex-row flex-col @xl/settings-row:items-center @xl/settings-row:justify-between @xl/settings-row:gap-8 gap-3">
				<div className="flex min-w-0 flex-col gap-1">
					{label}
					{description && (
						<p className="max-w-xl text-pretty text-muted-foreground text-sm leading-relaxed">
							{description}
						</p>
					)}
				</div>
				<div
					className={cn(
						"@xl/settings-row:w-auto w-full shrink-0",
						controlClassName,
					)}
				>
					{children}
				</div>
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
