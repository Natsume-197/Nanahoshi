import { render } from "@testing-library/react";
import type { ReactNode } from "react";

/** Exercise a hook together with the lifecycle binding its host renders. */
export function renderBindingHook<Result, Props>(
	callback: (props: Props) => Result,
	options?: { initialProps: Props },
) {
	const result = { current: undefined as Result };
	function Host({ value }: { value: Props }) {
		result.current = callback(value);
		const current = result.current;
		return current && typeof current === "object" && "binding" in current
			? (current.binding as ReactNode)
			: null;
	}
	const view = render(<Host value={options?.initialProps as Props} />);
	return {
		result,
		rerender: (value: Props) => view.rerender(<Host value={value} />),
		unmount: view.unmount,
	};
}
