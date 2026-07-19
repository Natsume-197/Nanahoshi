import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"group/button inline-flex shrink-0 cursor-pointer select-none items-center justify-center whitespace-nowrap rounded-2xl border border-transparent bg-clip-padding font-medium text-sm outline-none transition-all duration-150 ease-out-quart focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px active:not-aria-[haspopup]:duration-75 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-primary text-primary-foreground hover:bg-primary/80",
				ambient:
					"hover:bg-surface-hover hover:text-foreground focus-visible:bg-surface-hover aria-expanded:bg-surface-accent aria-expanded:text-foreground",
				sidebar:
					"hover:bg-sidebar-accent/60 hover:text-sidebar-foreground focus-visible:border-transparent focus-visible:bg-sidebar-accent/60 focus-visible:ring-2 focus-visible:ring-sidebar-ring/50 focus-visible:ring-inset focus-visible:duration-0 active:bg-sidebar-accent/80 aria-expanded:bg-sidebar-accent/80 aria-expanded:text-sidebar-foreground",
				outline:
					"border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:bg-transparent dark:hover:bg-input/30",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
				ghost:
					"hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
				destructive:
					"bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 dark:hover:bg-destructive/30",
				link: "text-primary underline-offset-4 hover:underline",
			},
			size: {
				default:
					"h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5",
				xs: "h-6 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
				sm: "h-7 gap-1 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				lg: "h-9 gap-1.5 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
				icon: "size-8",
				"icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
				"icon-sm": "size-7",
				"icon-lg": "size-9",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	nativeButton,
	children,
	...props
}: React.ComponentProps<typeof ButtonPrimitive> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	// asChild renders a non-<button> element (usually a <Link>/<a>), so tell Base
	// UI to drop the native-button assumption — otherwise it warns that the
	// rendered element isn't a native <button>. Callers can still override.
	const renderChild = asChild && React.isValidElement(children);
	return (
		<ButtonPrimitive
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			nativeButton={nativeButton ?? !renderChild}
			render={renderChild ? children : undefined}
			{...props}
		>
			{asChild ? undefined : children}
		</ButtonPrimitive>
	);
}

export { Button, buttonVariants };
