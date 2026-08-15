import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { CaretRight, Check } from "@phosphor-icons/react";
import * as React from "react";
import { cn } from "@/lib/utils";

const contextMenuItemClassName =
	"group/context-menu-item relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm outline-hidden transition-[background-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-dropdown-destructive data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:ps-7 data-[variant=destructive]:text-dropdown-destructive data-highlighted:text-accent-foreground data-disabled:opacity-50 dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-[variant=destructive]:*:[svg]:text-dropdown-destructive data-highlighted:*:[svg]:text-accent-foreground";

function ContextMenu({
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
	return <ContextMenuPrimitive.Root {...props} />;
}

function ContextMenuTrigger({
	className,
	asChild,
	children,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Trigger> & {
	asChild?: boolean;
}) {
	return (
		<ContextMenuPrimitive.Trigger
			data-slot="context-menu-trigger"
			className={className}
			render={asChild && React.isValidElement(children) ? children : undefined}
			{...props}
		>
			{asChild ? undefined : children}
		</ContextMenuPrimitive.Trigger>
	);
}

function ContextMenuGroup({
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
	return (
		<ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
	);
}

function ContextMenuPortal({
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Portal>) {
	return (
		<ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} />
	);
}

function ContextMenuSub({
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubmenuRoot>) {
	return <ContextMenuPrimitive.SubmenuRoot {...props} />;
}

function ContextMenuRadioGroup({
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioGroup>) {
	return (
		<ContextMenuPrimitive.RadioGroup
			data-slot="context-menu-radio-group"
			{...props}
		/>
	);
}

function ContextMenuContent({
	className,
	side,
	align = "start",
	sideOffset = 4,
	alignOffset,
	collisionPadding,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Popup> &
	Pick<
		React.ComponentProps<typeof ContextMenuPrimitive.Positioner>,
		"align" | "side" | "sideOffset" | "alignOffset" | "collisionPadding"
	> & {
		side?: "top" | "right" | "bottom" | "left";
	}) {
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Positioner
				align={align}
				side={side}
				sideOffset={sideOffset}
				alignOffset={alignOffset}
				collisionPadding={collisionPadding}
				data-slot="context-menu-positioner"
				className="isolate z-50"
			>
				<ContextMenuPrimitive.Popup
					data-slot="context-menu-content"
					className={cn(
						"motion-safe:data-closed:fade-out-0 motion-safe:data-open:fade-in-0 z-50 max-h-(--available-height) min-w-36 overflow-y-auto overflow-x-hidden rounded-2xl bg-dropdown p-1 text-popover-foreground shadow-dropdown motion-safe:duration-100 motion-safe:data-closed:animate-out motion-safe:data-open:animate-in",
						className,
					)}
					{...props}
				/>
			</ContextMenuPrimitive.Positioner>
		</ContextMenuPrimitive.Portal>
	);
}

function ContextMenuItem({
	className,
	inset,
	variant = "default",
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
	inset?: boolean;
	variant?: "default" | "destructive";
}) {
	return (
		<ContextMenuPrimitive.Item
			data-slot="context-menu-item"
			data-inset={inset}
			data-variant={variant}
			className={cn(contextMenuItemClassName, className)}
			{...props}
		/>
	);
}

function ContextMenuLinkItem({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.LinkItem>) {
	return (
		<ContextMenuPrimitive.LinkItem
			data-slot="context-menu-link-item"
			className={cn(contextMenuItemClassName, className)}
			{...props}
		/>
	);
}

function ContextMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubmenuTrigger> & {
	inset?: boolean;
}) {
	return (
		<ContextMenuPrimitive.SubmenuTrigger
			data-slot="context-menu-sub-trigger"
			data-inset={inset}
			className={cn(
				"flex min-h-8 cursor-default select-none items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm outline-hidden transition-[background-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-highlighted:bg-accent data-open:bg-accent data-inset:ps-7 data-highlighted:text-accent-foreground data-open:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		>
			{children}
			<CaretRight className="ms-auto rtl:-scale-x-100" />
		</ContextMenuPrimitive.SubmenuTrigger>
	);
}

function ContextMenuSubContent({
	className,
	sideOffset = 4,
	align = "start",
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Popup> &
	Pick<
		React.ComponentProps<typeof ContextMenuPrimitive.Positioner>,
		"align" | "side" | "sideOffset" | "alignOffset" | "collisionPadding"
	>) {
	return (
		<ContextMenuPrimitive.Portal>
			<ContextMenuPrimitive.Positioner
				align={align}
				sideOffset={sideOffset}
				data-slot="context-menu-sub-positioner"
				className="isolate z-50"
			>
				<ContextMenuPrimitive.Popup
					data-slot="context-menu-sub-content"
					className={cn(
						"motion-safe:data-closed:fade-out-0 motion-safe:data-open:fade-in-0 z-50 min-w-32 overflow-hidden rounded-2xl bg-dropdown p-1 text-popover-foreground shadow-dropdown motion-safe:duration-100 motion-safe:data-closed:animate-out motion-safe:data-open:animate-in",
						className,
					)}
					{...props}
				/>
			</ContextMenuPrimitive.Positioner>
		</ContextMenuPrimitive.Portal>
	);
}

function ContextMenuCheckboxItem({
	className,
	children,
	checked,
	inset,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem> & {
	inset?: boolean;
}) {
	return (
		<ContextMenuPrimitive.CheckboxItem
			data-slot="context-menu-checkbox-item"
			data-inset={inset}
			className={cn(
				"relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-xl py-1.5 ps-2.5 pe-8 text-sm outline-hidden transition-[background-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:ps-7 data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			checked={checked}
			closeOnClick={false}
			{...props}
		>
			<span className="pointer-events-none absolute end-2">
				<ContextMenuPrimitive.CheckboxItemIndicator>
					<Check />
				</ContextMenuPrimitive.CheckboxItemIndicator>
			</span>
			{children}
		</ContextMenuPrimitive.CheckboxItem>
	);
}

function ContextMenuRadioItem({
	className,
	children,
	inset,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.RadioItem> & {
	inset?: boolean;
}) {
	return (
		<ContextMenuPrimitive.RadioItem
			data-slot="context-menu-radio-item"
			data-inset={inset}
			className={cn(
				"relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-xl py-1.5 ps-2.5 pe-8 text-sm outline-hidden transition-[background-color,color] duration-100 focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2 data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:ps-7 data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			closeOnClick={false}
			{...props}
		>
			<span className="pointer-events-none absolute end-2">
				<ContextMenuPrimitive.RadioItemIndicator>
					<Check />
				</ContextMenuPrimitive.RadioItemIndicator>
			</span>
			{children}
		</ContextMenuPrimitive.RadioItem>
	);
}

function ContextMenuLabel({
	className,
	inset,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.GroupLabel> & {
	inset?: boolean;
}) {
	return (
		<ContextMenuPrimitive.GroupLabel
			data-slot="context-menu-label"
			data-inset={inset}
			className={cn(
				"px-2.5 py-1.5 font-medium text-muted-foreground text-xs data-inset:ps-7",
				className,
			)}
			{...props}
		/>
	);
}

function ContextMenuSeparator({
	className,
	...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
	return (
		<ContextMenuPrimitive.Separator
			data-slot="context-menu-separator"
			className={cn("-mx-1 my-1 h-px bg-border/70", className)}
			{...props}
		/>
	);
}

function ContextMenuShortcut({
	className,
	...props
}: React.ComponentProps<"span">) {
	return (
		<span
			data-slot="context-menu-shortcut"
			className={cn(
				"ms-auto ps-4 text-muted-foreground text-xs tracking-wide group-data-highlighted/context-menu-item:text-accent-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export {
	ContextMenu,
	ContextMenuCheckboxItem,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuLinkItem,
	ContextMenuPortal,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
	ContextMenuTrigger,
};
