import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const toggleVariants = cva(
	"group/toggle inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-2xl font-medium text-sm outline-none transition-[color,background-color,box-shadow] hover:bg-muted hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-transparent aria-pressed:bg-muted",
				outline: "border border-input bg-transparent aria-pressed:bg-muted",
				category:
					"rounded-xl bg-muted text-foreground transition-[background-color,color,scale] duration-150 hover:bg-muted/75 active:scale-[0.96] aria-pressed:bg-foreground aria-pressed:text-background motion-reduce:transition-none motion-reduce:active:scale-100",
				segmented:
					"rounded-xl bg-transparent text-muted-foreground hover:bg-foreground/5 hover:text-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground aria-pressed:shadow-sm",
				line: "relative rounded-none bg-transparent text-muted-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity after:duration-200 hover:bg-transparent hover:text-foreground aria-pressed:text-foreground aria-pressed:after:opacity-100",
			},
			size: {
				default:
					"h-8 min-w-8 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
				sm: "h-7 min-w-7 px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5",
				category: "min-h-10 px-4 font-semibold",
				lg: "h-9 min-w-9 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Toggle({
	className,
	variant = "default",
	size = "default",
	...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
	return (
		<TogglePrimitive
			data-slot="toggle"
			className={cn(toggleVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Toggle, toggleVariants };
