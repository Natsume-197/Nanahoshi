import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check, Minus } from "@phosphor-icons/react";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Checkbox({
	className,
	...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
	return (
		<CheckboxPrimitive.Root
			data-slot="checkbox"
			className={cn(
				"peer relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-[5px] border border-transparent bg-input/90 outline-none transition-shadow after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 group-has-disabled/field:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 aria-invalid:aria-checked:border-primary data-checked:border-primary data-indeterminate:border-primary data-checked:bg-primary data-indeterminate:bg-primary data-checked:text-primary-foreground data-indeterminate:text-primary-foreground dark:data-checked:bg-primary dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className,
			)}
			{...props}
		>
			{/* Base UI renders the indicator for both checked and indeterminate, so
			    the dash is what tells "some of this page" apart from "all of it". */}
			<CheckboxPrimitive.Indicator
				data-slot="checkbox-indicator"
				className="group/checkbox-indicator grid place-content-center text-current transition-none [&>svg]:size-3.5"
			>
				<Check className="group-data-indeterminate/checkbox-indicator:hidden" />
				<Minus
					weight="bold"
					className="hidden group-data-indeterminate/checkbox-indicator:block"
				/>
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
