"use client";

import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";

import { cn } from "@/lib/utils";

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
	return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ ...props }: CollapsiblePrimitive.Trigger.Props) {
	return (
		<CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />
	);
}

function CollapsibleContent({
	className,
	...props
}: CollapsiblePrimitive.Panel.Props) {
	return (
		<CollapsiblePrimitive.Panel
			data-slot="collapsible-content"
			className={cn(
				"data-open:fade-in-0 data-open:slide-in-from-top-1 data-closed:fade-out-0 data-closed:slide-out-to-top-1 overflow-hidden data-closed:animate-out data-open:animate-in",
				className,
			)}
			{...props}
		/>
	);
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
