import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import * as React from "react";

import { cn } from "@/lib/utils";

function TooltipProvider({
	delayDuration = 0,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider> & {
	delayDuration?: number;
}) {
	return (
		<TooltipPrimitive.Provider
			data-slot="tooltip-provider"
			delay={delayDuration}
			{...props}
		/>
	);
}

function Tooltip({
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
	return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger({
	asChild,
	children,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger> & { asChild?: boolean }) {
	return (
		<TooltipPrimitive.Trigger
			data-slot="tooltip-trigger"
			render={asChild && React.isValidElement(children) ? children : undefined}
			{...props}
		>
			{asChild ? undefined : children}
		</TooltipPrimitive.Trigger>
	);
}

function TooltipContent({
	className,
	sideOffset = 0,
	children,
	side,
	align,
	...props
}: React.ComponentProps<typeof TooltipPrimitive.Popup> &
	Pick<
		React.ComponentProps<typeof TooltipPrimitive.Positioner>,
		"align" | "side" | "sideOffset" | "alignOffset" | "collisionPadding"
	>) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Positioner
				align={align}
				side={side}
				sideOffset={sideOffset}
				data-slot="tooltip-positioner"
			>
				<TooltipPrimitive.Popup
					data-slot="tooltip-content"
					className={cn(
						"data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-xl bg-foreground px-3 py-1.5 text-background text-xs has-data-[slot=kbd]:pr-1.5 data-closed:animate-out data-open:animate-in **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-lg",
						className,
					)}
					{...props}
				>
					{children}
					<TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=left]:translate-x-[-1.5px] data-[side=right]:translate-x-[1.5px]" />
				</TooltipPrimitive.Popup>
			</TooltipPrimitive.Positioner>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
