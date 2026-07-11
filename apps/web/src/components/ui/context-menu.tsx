import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu";
import { CaretRight, Check } from "@phosphor-icons/react";
import * as React from "react";
import { cn } from "@/lib/utils";

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
			>
				<ContextMenuPrimitive.Popup
					data-slot="context-menu-content"
					className={cn(
						"data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-open:fade-in-0 data-open:zoom-in-[0.97] data-closed:fade-out-0 data-closed:zoom-out-[0.99] z-50 max-h-(--available-height) min-w-36 origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-2xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 ease-out-quint data-closed:animate-out data-closed:duration-100 data-open:animate-in data-open:duration-200 motion-reduce:transform-none motion-reduce:animate-none dark:ring-foreground/10",
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
			className={cn(
				"group/context-menu-item relative flex min-h-7 cursor-default select-none items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden data-[variant=destructive]:data-highlighted:bg-destructive/10 data-[variant=destructive]:data-highlighted:text-destructive data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:pl-7 data-[variant=destructive]:text-destructive data-highlighted:text-accent-foreground data-disabled:opacity-50 dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 data-[variant=destructive]:*:[svg]:text-destructive data-highlighted:*:[svg]:text-accent-foreground",
				className,
			)}
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
				"flex min-h-7 cursor-default select-none items-center gap-2 rounded-xl px-2 py-1.5 text-sm outline-hidden data-highlighted:bg-accent data-open:bg-accent data-inset:pl-7 data-highlighted:text-accent-foreground data-open:text-accent-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			{...props}
		>
			{children}
			<CaretRight className="ml-auto" />
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
			>
				<ContextMenuPrimitive.Popup
					data-slot="context-menu-sub-content"
					className={cn(
						"data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1 data-open:fade-in-0 data-open:zoom-in-[0.97] data-closed:fade-out-0 data-closed:zoom-out-[0.99] z-50 min-w-32 origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/5 ease-out-quint data-closed:animate-out data-closed:duration-100 data-open:animate-in data-open:duration-200 motion-reduce:transform-none motion-reduce:animate-none dark:ring-foreground/10",
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
				"relative flex min-h-7 cursor-default select-none items-center gap-2 rounded-xl py-1.5 pr-8 pl-2 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:pl-7 data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			checked={checked}
			closeOnClick={false}
			{...props}
		>
			<span className="pointer-events-none absolute right-2">
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
				"relative flex min-h-7 cursor-default select-none items-center gap-2 rounded-xl py-1.5 pr-8 pl-2 text-sm outline-hidden data-disabled:pointer-events-none data-highlighted:bg-accent data-inset:pl-7 data-highlighted:text-accent-foreground data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			closeOnClick={false}
			{...props}
		>
			<span className="pointer-events-none absolute right-2">
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
				"px-2 py-1 text-muted-foreground text-xs data-inset:pl-7",
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
			className={cn("-mx-1 my-1 h-px bg-border/50", className)}
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
				"ml-auto text-muted-foreground text-xs tracking-widest group-focus/context-menu-item:text-accent-foreground",
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
