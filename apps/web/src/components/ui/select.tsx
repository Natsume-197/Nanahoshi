"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { CaretDown, CaretUp, Check } from "@phosphor-icons/react";
import type * as React from "react";
import { cn } from "@/lib/utils";

type SelectProps<Value, Multiple extends boolean | undefined> = Omit<
	SelectPrimitive.Root.Props<Value, Multiple>,
	"onValueChange"
> & {
	onValueChange?: (
		value: Multiple extends true ? Value[] : Value,
		eventDetails: SelectPrimitive.Root.ChangeEventDetails,
	) => void;
};

function Select<Value = string, Multiple extends boolean | undefined = false>({
	onValueChange,
	...props
}: SelectProps<Value, Multiple>) {
	return (
		<SelectPrimitive.Root<Value, Multiple>
			onValueChange={
				onValueChange as SelectPrimitive.Root.Props<
					Value,
					Multiple
				>["onValueChange"]
			}
			{...props}
		/>
	);
}

function SelectGroup({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
	return (
		<SelectPrimitive.Group
			data-slot="select-group"
			className={cn("scroll-my-1.5 p-1", className)}
			{...props}
		/>
	);
}

function SelectValue({
	...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
	return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
	className,
	size = "default",
	children,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
	size?: "sm" | "default";
}) {
	return (
		<SelectPrimitive.Trigger
			data-slot="select-trigger"
			data-size={size}
			className={cn(
				"flex w-fit cursor-pointer items-center justify-between gap-1.5 whitespace-nowrap rounded-2xl border border-transparent bg-control px-3 py-2 text-sm outline-none transition-[color,box-shadow] duration-200 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=default]:h-8 data-[size=sm]:h-7 data-placeholder:text-muted-foreground *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		>
			{children}
			<SelectPrimitive.Icon>
				<CaretDown className="pointer-events-none size-4 text-muted-foreground" />
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
}

function SelectContent({
	className,
	children,
	position = "item-aligned",
	align = "center",
	side,
	sideOffset = 4,
	alignOffset,
	collisionPadding,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Popup> &
	Pick<
		React.ComponentProps<typeof SelectPrimitive.Positioner>,
		| "align"
		| "side"
		| "sideOffset"
		| "alignOffset"
		| "collisionPadding"
		| "alignItemWithTrigger"
	> & {
		position?: "item-aligned" | "popper";
	}) {
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Positioner
				align={align}
				side={side}
				sideOffset={sideOffset}
				alignOffset={alignOffset}
				collisionPadding={collisionPadding}
				alignItemWithTrigger={position === "item-aligned"}
				data-slot="select-positioner"
				className="isolate z-50"
			>
				<SelectPrimitive.Popup
					data-slot="select-content"
					data-align-trigger={position === "item-aligned"}
					className={cn(
						"motion-safe:data-closed:fade-out-0 motion-safe:data-open:fade-in-0 relative z-50 max-h-(--available-height) min-w-36 overflow-hidden rounded-2xl bg-dropdown text-popover-foreground shadow-dropdown data-[align-trigger=true]:animate-none motion-safe:duration-100 motion-safe:data-closed:animate-out motion-safe:data-open:animate-in",
						position === "popper" &&
							"data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
						className,
					)}
					{...props}
				>
					<SelectScrollUpButton />
					<SelectPrimitive.List
						data-position={position}
						className={cn(
							"max-h-(--available-height) overflow-y-auto overflow-x-hidden data-[position=popper]:w-full data-[position=popper]:min-w-(--anchor-width)",
							position === "popper" && "",
						)}
					>
						{children}
					</SelectPrimitive.List>
					<SelectScrollDownButton />
				</SelectPrimitive.Popup>
			</SelectPrimitive.Positioner>
		</SelectPrimitive.Portal>
	);
}

function SelectLabel({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.GroupLabel>) {
	return (
		<SelectPrimitive.GroupLabel
			data-slot="select-label"
			className={cn(
				"px-2.5 py-1.5 font-medium text-muted-foreground text-xs",
				className,
			)}
			{...props}
		/>
	);
}

function SelectItem({
	className,
	children,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
	return (
		<SelectPrimitive.Item
			data-slot="select-item"
			className={cn(
				"relative flex min-h-8 w-full cursor-pointer select-none items-center gap-2 rounded-xl py-1.5 ps-2.5 pe-8 text-sm outline-hidden transition-[background-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-disabled:pointer-events-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50 data-highlighted:**:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				className,
			)}
			{...props}
		>
			<span className="pointer-events-none absolute end-2 flex size-4 items-center justify-center">
				<SelectPrimitive.ItemIndicator>
					<Check className="pointer-events-none" />
				</SelectPrimitive.ItemIndicator>
			</span>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	);
}

function SelectSeparator({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
	return (
		<SelectPrimitive.Separator
			data-slot="select-separator"
			className={cn(
				"pointer-events-none -mx-1 my-1 h-px bg-border/70",
				className,
			)}
			{...props}
		/>
	);
}

function SelectScrollUpButton({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
	return (
		<SelectPrimitive.ScrollUpArrow
			data-slot="select-scroll-up-button"
			className={cn(
				"z-10 flex min-h-8 cursor-pointer items-center justify-center bg-dropdown py-1 text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		>
			<CaretUp />
		</SelectPrimitive.ScrollUpArrow>
	);
}

function SelectScrollDownButton({
	className,
	...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
	return (
		<SelectPrimitive.ScrollDownArrow
			data-slot="select-scroll-down-button"
			className={cn(
				"z-10 flex min-h-8 cursor-pointer items-center justify-center bg-dropdown py-1 text-muted-foreground transition-colors duration-100 hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			{...props}
		>
			<CaretDown />
		</SelectPrimitive.ScrollDownArrow>
	);
}

export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectScrollDownButton,
	SelectScrollUpButton,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
};
