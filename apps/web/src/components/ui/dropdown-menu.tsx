"use client";

import { Menu as DropdownMenuPrimitive } from "@base-ui/react/menu";
import { CaretRight, Check } from "@phosphor-icons/react";
import * as React from "react";
import { cn } from "@/lib/utils";

function DropdownMenu({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
	return <DropdownMenuPrimitive.Root {...props} />;
}

function DropdownMenuPortal({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
	return (
		<DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
	);
}

function DropdownMenuTrigger({
	asChild,
	children,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger> & {
	asChild?: boolean;
}) {
	return (
		<DropdownMenuPrimitive.Trigger
			data-slot="dropdown-menu-trigger"
			render={asChild && React.isValidElement(children) ? children : undefined}
			{...props}
		>
			{asChild ? undefined : children}
		</DropdownMenuPrimitive.Trigger>
	);
}

function DropdownMenuContent({
	className,
	align = "start",
	side,
	sideOffset = 4,
	alignOffset,
	collisionPadding,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Popup> &
	Pick<
		React.ComponentProps<typeof DropdownMenuPrimitive.Positioner>,
		"align" | "side" | "sideOffset" | "alignOffset" | "collisionPadding"
	>) {
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Positioner
				sideOffset={sideOffset}
				side={side}
				align={align}
				alignOffset={alignOffset}
				collisionPadding={collisionPadding}
				data-slot="dropdown-menu-positioner"
				className="isolate z-50 outline-none"
			>
				<DropdownMenuPrimitive.Popup
					data-slot="dropdown-menu-content"
					className={cn(
						"motion-safe:data-closed:fade-out-0 motion-safe:data-open:fade-in-0 z-50 max-h-(--available-height) w-(--anchor-width) min-w-32 overflow-y-auto overflow-x-hidden rounded-2xl bg-dropdown p-1 text-popover-foreground shadow-dropdown data-closed:overflow-hidden motion-safe:duration-100 motion-safe:data-closed:animate-out motion-safe:data-open:animate-in",
						className,
					)}
					{...props}
				/>
			</DropdownMenuPrimitive.Positioner>
		</DropdownMenuPrimitive.Portal>
	);
}

function DropdownMenuGroup({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
	return (
		<DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
	);
}

function DropdownMenuItem({
	className,
	inset,
	variant = "default",
	asChild,
	children,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
	inset?: boolean;
	variant?: "default" | "destructive";
	asChild?: boolean;
}) {
	return (
		<DropdownMenuPrimitive.Item
			data-slot="dropdown-menu-item"
			data-inset={inset}
			data-variant={variant}
			className={cn(
				"group/dropdown-menu-item relative flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm outline-hidden transition-[background-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-dropdown-destructive data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:ps-7 data-[variant=destructive]:text-dropdown-destructive data-highlighted:text-accent-foreground data-disabled:opacity-50 not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-[variant=destructive]:*:[svg]:text-dropdown-destructive",
				className,
			)}
			render={asChild && React.isValidElement(children) ? children : undefined}
			{...props}
		>
			{asChild ? undefined : children}
		</DropdownMenuPrimitive.Item>
	);
}

function DropdownMenuCheckboxItem({
	className,
	children,
	checked,
	inset,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & {
	inset?: boolean;
}) {
	return (
		<DropdownMenuPrimitive.CheckboxItem
			data-slot="dropdown-menu-checkbox-item"
			data-inset={inset}
			className={cn(
				"relative flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-xl py-1.5 ps-2.5 pe-8 text-sm outline-hidden transition-[background-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:ps-7 data-highlighted:text-accent-foreground data-disabled:opacity-50 data-highlighted:**:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			checked={checked}
			closeOnClick={false}
			{...props}
		>
			<span
				className="pointer-events-none absolute end-2 flex items-center justify-center"
				data-slot="dropdown-menu-checkbox-item-indicator"
			>
				<DropdownMenuPrimitive.CheckboxItemIndicator>
					<Check />
				</DropdownMenuPrimitive.CheckboxItemIndicator>
			</span>
			{children}
		</DropdownMenuPrimitive.CheckboxItem>
	);
}

function DropdownMenuRadioGroup({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
	return (
		<DropdownMenuPrimitive.RadioGroup
			data-slot="dropdown-menu-radio-group"
			{...props}
		/>
	);
}

function DropdownMenuRadioItem({
	className,
	children,
	inset,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & {
	inset?: boolean;
}) {
	return (
		<DropdownMenuPrimitive.RadioItem
			data-slot="dropdown-menu-radio-item"
			data-inset={inset}
			className={cn(
				"relative flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-xl py-1.5 ps-2.5 pe-8 text-sm outline-hidden transition-[background-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:ps-7 data-highlighted:text-accent-foreground data-disabled:opacity-50 data-highlighted:**:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			closeOnClick={false}
			{...props}
		>
			<span
				className="pointer-events-none absolute end-2 flex items-center justify-center"
				data-slot="dropdown-menu-radio-item-indicator"
			>
				<DropdownMenuPrimitive.RadioItemIndicator>
					<Check />
				</DropdownMenuPrimitive.RadioItemIndicator>
			</span>
			{children}
		</DropdownMenuPrimitive.RadioItem>
	);
}

function DropdownMenuLabel({
	className,
	inset,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.GroupLabel> & {
	inset?: boolean;
}) {
	return (
		<DropdownMenuPrimitive.GroupLabel
			data-slot="dropdown-menu-label"
			data-inset={inset}
			className={cn(
				"px-2.5 py-1.5 font-medium text-muted-foreground text-xs data-inset:ps-7",
				className,
			)}
			{...props}
		/>
	);
}

function DropdownMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
	return (
		<DropdownMenuPrimitive.Separator
			data-slot="dropdown-menu-separator"
			className={cn("-mx-1 my-1 h-px bg-border/70", className)}
			{...props}
		/>
	);
}

function DropdownMenuShortcut({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="dropdown-menu-shortcut"
			className={cn(
				"ms-auto ps-4 text-muted-foreground text-xs tracking-wide group-data-highlighted/dropdown-menu-item:text-accent-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function DropdownMenuSub({
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubmenuRoot>) {
	return (
		<DropdownMenuPrimitive.SubmenuRoot
			data-slot="dropdown-menu-sub"
			{...props}
		/>
	);
}

function DropdownMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubmenuTrigger> & {
	inset?: boolean;
}) {
	return (
		<DropdownMenuPrimitive.SubmenuTrigger
			data-slot="dropdown-menu-sub-trigger"
			data-inset={inset}
			className={cn(
				"flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm outline-hidden transition-[background-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-highlighted:bg-accent data-open:bg-accent data-inset:ps-7 data-highlighted:text-accent-foreground data-open:text-accent-foreground data-highlighted:**:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		>
			{children}
			<CaretRight className="ms-auto rtl:-scale-x-100" />
		</DropdownMenuPrimitive.SubmenuTrigger>
	);
}

function DropdownMenuSubContent({
	className,
	sideOffset = 4,
	align = "start",
	...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Popup> &
	Pick<
		React.ComponentProps<typeof DropdownMenuPrimitive.Positioner>,
		"align" | "side" | "sideOffset" | "alignOffset" | "collisionPadding"
	>) {
	return (
		<DropdownMenuPrimitive.Portal>
			<DropdownMenuPrimitive.Positioner
				align={align}
				sideOffset={sideOffset}
				data-slot="dropdown-menu-sub-positioner"
				className="isolate z-50 outline-none"
			>
				<DropdownMenuPrimitive.Popup
					data-slot="dropdown-menu-sub-content"
					className={cn(
						"motion-safe:data-closed:fade-out-0 motion-safe:data-open:fade-in-0 z-50 min-w-24 overflow-hidden rounded-2xl bg-dropdown p-1 text-popover-foreground shadow-dropdown motion-safe:duration-100 motion-safe:data-closed:animate-out motion-safe:data-open:animate-in",
						className,
					)}
					{...props}
				/>
			</DropdownMenuPrimitive.Positioner>
		</DropdownMenuPrimitive.Portal>
	);
}

export {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuPortal,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
};
