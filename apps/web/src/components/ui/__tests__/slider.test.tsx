import "@/test-utils/setup-dom";
import { afterEach, describe, expect, it, mock } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Slider } from "../slider";

afterEach(cleanup);

describe("Slider", () => {
	it("updates its value when the track is pressed", () => {
		const onValueChange = mock(() => undefined);
		const { container } = render(
			<Slider defaultValue={[25]} onValueChange={onValueChange} />,
		);
		const control = container.querySelector('[data-slot="slider-control"]');

		expect(control).not.toBeNull();
		Object.defineProperty(control, "getBoundingClientRect", {
			value: () => ({
				x: 0,
				y: 0,
				left: 0,
				top: 0,
				right: 100,
				bottom: 4,
				width: 100,
				height: 4,
				toJSON: () => undefined,
			}),
		});
		Object.defineProperties(control, {
			setPointerCapture: { value: () => undefined },
			releasePointerCapture: { value: () => undefined },
		});

		fireEvent.pointerDown(control as Element, {
			button: 0,
			clientX: 75,
			clientY: 2,
			pointerId: 1,
			pointerType: "mouse",
		});

		expect(onValueChange.mock.calls.map((call) => call[0])).toEqual([[75]]);
	});
});
