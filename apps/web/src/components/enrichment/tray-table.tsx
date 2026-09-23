// The dense table shared by both tray tabs. The table owns one column template
// (`gridClassName`); the header and every row are subgrids of it, so an
// auto-sized column takes its widest cell on the page and every row lines up.

import type { ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

export const TRAY_ROW_SUBGRID =
	"col-span-full grid grid-cols-subgrid items-center";

export function TrayTable({
	label,
	gridClassName,
	dimmed = false,
	header,
	children,
}: {
	label: string;
	gridClassName: string;
	/** Placeholder data while the next page loads. */
	dimmed?: boolean;
	header: ReactNode;
	children: ReactNode;
}) {
	return (
		<table
			aria-label={label}
			className={cn(
				gridClassName,
				"border-spacing-0 transition-opacity",
				dimmed && "pointer-events-none opacity-50",
			)}
		>
			<thead className="contents">
				<tr
					className={cn(
						TRAY_ROW_SUBGRID,
						"sticky top-0 z-30 border-border/60 border-b bg-background px-3 text-muted-foreground",
					)}
				>
					{header}
				</tr>
			</thead>
			<tbody className="contents">{children}</tbody>
		</table>
	);
}

export function TrayHeaderCell({
	children,
	className,
}: {
	children?: ReactNode;
	className?: string;
}) {
	return (
		<th
			scope="col"
			className={cn(
				"flex h-[38px] items-center px-1.5 font-medium text-xs",
				className,
			)}
		>
			{children}
		</th>
	);
}

export function TrayRow({
	rowKey,
	selected,
	open = false,
	onOpen,
	children,
}: {
	rowKey: string;
	selected: boolean;
	open?: boolean;
	/** Makes the whole row a tab stop that opens its detail. */
	onOpen?: () => void;
	children: ReactNode;
}) {
	return (
		<tr
			data-match-row={rowKey}
			data-active={open}
			tabIndex={onOpen ? 0 : undefined}
			onClick={
				onOpen
					? (event) => {
							if (
								(event.target as HTMLElement).closest(
									'button,a,input,[role="checkbox"]',
								)
							)
								return;
							onOpen();
						}
					: undefined
			}
			onKeyDown={
				onOpen
					? (event) => {
							if (event.target !== event.currentTarget) return;
							if (event.key === "Enter" || event.key === " ") {
								event.preventDefault();
								onOpen();
							}
						}
					: undefined
			}
			className={cn(
				TRAY_ROW_SUBGRID,
				"group border-border/40 border-b px-3 outline-none transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
				onOpen && "cursor-pointer",
				// Selection needs to read at a glance across a page; the open row
				// stays clearly the stronger tint so the two never compete.
				open ? "bg-primary/16" : "hover:bg-muted/55",
				selected && !open && "bg-primary/6",
			)}
		>
			{children}
		</tr>
	);
}

export function TrayCell({
	children,
	className,
}: {
	children?: ReactNode;
	className?: string;
}) {
	return (
		<td
			className={cn(
				"flex min-w-0 items-center bg-inherit px-1.5 py-2",
				className,
			)}
		>
			{children}
		</td>
	);
}

export function TraySelectCell({
	checked,
	indeterminate,
	disabled,
	label,
	onToggle,
	header = false,
}: {
	checked: boolean;
	indeterminate?: boolean;
	disabled?: boolean;
	label: string;
	onToggle: () => void;
	header?: boolean;
}) {
	const box = (
		<Checkbox
			checked={checked}
			indeterminate={indeterminate}
			disabled={disabled}
			onCheckedChange={onToggle}
			aria-label={label}
		/>
	);
	return header ? (
		<TrayHeaderCell className="justify-center">{box}</TrayHeaderCell>
	) : (
		<TrayCell className="justify-center">{box}</TrayCell>
	);
}
