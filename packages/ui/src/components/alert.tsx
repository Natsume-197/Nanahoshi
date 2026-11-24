import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "../lib/utils";

const alertVariants = cva(
	"group/alert relative grid w-full gap-0.5 rounded-2xl border px-4 py-3 text-left text-sm has-data-[slot=alert-action]:relative has-[>svg]:grid-cols-[auto_1fr] has-[>svg]:gap-x-2.5 has-data-[slot=alert-action]:pr-12 *:[svg:not([class*='size-'])]:size-4 *:[svg]:row-span-2 *:[svg]:translate-y-0.5",
	{
		variants: {
			variant: {
				default: "bg-card text-card-foreground *:[svg]:text-muted-foreground",
				info: "border-info/25 bg-info/8 text-foreground *:[svg]:text-info",
				success:
					"border-success/25 bg-success/8 text-foreground *:[svg]:text-success",
				warning:
					"border-warning/30 bg-warning/10 text-foreground *:[svg]:text-warning",
				destructive:
					"border-destructive/40 bg-destructive/12 text-foreground *:[svg]:text-destructive",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

type AlertVariant = NonNullable<VariantProps<typeof alertVariants>["variant"]>;

function Alert({
	className,
	variant,
	role,
	...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
	return (
		<div
			data-slot="alert"
			data-variant={variant ?? "default"}
			// Only urgent alerts interrupt a screen reader; the rest are polite.
			role={
				role ??
				(variant === "destructive" || variant === "warning"
					? "alert"
					: "status")
			}
			className={cn(alertVariants({ variant }), className)}
			{...props}
		/>
	);
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-title"
			className={cn(
				"font-medium group-has-[>svg]/alert:col-start-2 [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

function AlertDescription({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-description"
			className={cn(
				"text-balance text-muted-foreground text-sm group-has-[>svg]/alert:col-start-2 md:text-pretty [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-foreground [&_p:not(:last-child)]:mb-4",
				className,
			)}
			{...props}
		/>
	);
}

function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="alert-action"
			className={cn("absolute top-2 right-2", className)}
			{...props}
		/>
	);
}

export type { AlertVariant };
export { Alert, AlertAction, AlertDescription, AlertTitle, alertVariants };
