import { type FieldsetHTMLAttributes, useState } from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

/**
 * Prevents users and password managers from editing controlled fields before
 * React has attached their change handlers. Otherwise hydration can replace
 * those edits with the form's empty defaults.
 */
export function HydratedFieldset({
	disabled,
	children,
	...props
}: FieldsetHTMLAttributes<HTMLFieldSetElement>) {
	const [hydrated, setHydrated] = useState(false);
	useMountEffect(() => setHydrated(true));

	return (
		<fieldset {...props} disabled={disabled || !hydrated}>
			{children}
		</fieldset>
	);
}
