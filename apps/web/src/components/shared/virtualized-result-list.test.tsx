import "@/test-utils/setup-dom";
import { afterEach, expect, test } from "bun:test";
import {
	act,
	cleanup,
	fireEvent,
	render,
	waitFor,
} from "@testing-library/react";
import { ScrollContainerProvider } from "@/components/layout/scroll-container-context";
import { VirtualizedResultList } from "./virtualized-result-list";

const originalHeight = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	"offsetHeight",
);
const originalObserver = globalThis.ResizeObserver;

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
	if (originalHeight)
		Object.defineProperty(
			HTMLElement.prototype,
			"offsetHeight",
			originalHeight,
		);
	else Reflect.deleteProperty(HTMLElement.prototype, "offsetHeight");
	globalThis.ResizeObserver = originalObserver;
});

test("a thousand results mount only the viewport and retain focused keyboard neighbours", async () => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
		configurable: true,
		get() {
			return this.tagName === "MAIN" ? 548 : 137;
		},
	});
	const scroll = document.createElement("main");
	Object.defineProperty(scroll, "offsetWidth", { value: 800 });
	scroll.scrollTo = () => {};
	document.body.append(scroll);
	const renders = new Map<number, number>();
	let keyReads = 0;
	const view = render(
		<ScrollContainerProvider value={{ current: scroll }}>
			<VirtualizedResultList
				items={Array.from({ length: 1000 }, (_, i) => i)}
				getKey={(item) => {
					keyReads++;
					return item;
				}}
				renderItem={(item) => {
					renders.set(item, (renders.get(item) ?? 0) + 1);
					return <a href={`#${item}`}>Result {item}</a>;
				}}
			/>
		</ScrollContainerProvider>,
		{ container: scroll },
	);
	await waitFor(() =>
		expect(view.getAllByRole("listitem").length).toBeGreaterThan(0),
	);
	expect(view.getAllByRole("listitem").length).toBeLessThan(20);
	const firstRowRenders = renders.get(0);
	const initialKeyReads = keyReads;
	act(() => view.getByText("Result 0").focus());
	act(() => {
		scroll.scrollTop = 137 * 500;
		fireEvent.scroll(scroll);
	});
	await waitFor(() => expect(view.getByText("Result 500")).toBeTruthy());
	expect(document.activeElement).toBe(view.getByText("Result 0"));
	expect(view.getByText("Result 1")).toBeTruthy();
	expect(renders.get(0)).toBe(firstRowRenders);
	expect(keyReads - initialKeyReads).toBeLessThan(50);
	expect(view.getAllByRole("listitem").length).toBeLessThan(25);
	expect(
		view.getByText("Result 500").parentElement?.getAttribute("aria-posinset"),
	).toBe("501");
	expect(
		view.getByText("Result 500").parentElement?.getAttribute("aria-setsize"),
	).toBe("1000");
});
