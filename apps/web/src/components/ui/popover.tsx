import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as React from "react";

import { cn } from "@/lib/utils";

function Popover({
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
	asChild,
	children,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger> & { asChild?: boolean }) {
	return (
		<PopoverPrimitive.Trigger
			data-slot="popover-trigger"
			render={asChild && React.isValidElement(children) ? children : undefined}
			{...props}
		>
			{asChild ? undefined : children}
		</PopoverPrimitive.Trigger>
	);
}

function PopoverContent({
	className,
	align = "center",
	sideOffset = 4,
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> &
	Pick<
		React.ComponentProps<typeof PopoverPrimitive.Positioner>,
		"align" | "side" | "sideOffset" | "alignOffset" | "collisionPadding"
	>) {
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Positioner
				align={align}
				sideOffset={sideOffset}
				data-slot="popover-positioner"
			>
				<PopoverPrimitive.Popup
					data-slot="popover-content"
					className={cn(
						"data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 z-50 flex w-72 origin-(--transform-origin) flex-col gap-4 rounded-3xl bg-popover p-4 text-popover-foreground text-sm shadow-lg outline-hidden ring-1 ring-foreground/5 duration-100 data-closed:animate-out data-open:animate-in dark:ring-foreground/10",
						className,
					)}
					{...props}
				/>
			</PopoverPrimitive.Positioner>
		</PopoverPrimitive.Portal>
	);
}

function PopoverAnchor({
	...props
}: React.ComponentProps<"div">) {
	return <div data-slot="popover-anchor" {...props} />;
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="popover-header"
			className={cn("flex flex-col gap-1 text-sm", className)}
			{...props}
		/>
	);
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
	return (
		<div
			data-slot="popover-title"
			className={cn("font-medium text-base", className)}
			{...props}
		/>
	);
}

function PopoverDescription({
	className,
	...props
}: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="popover-description"
			className={cn("text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
};
