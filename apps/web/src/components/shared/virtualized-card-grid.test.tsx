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
import { VirtualizedCardGrid } from "./virtualized-card-grid";

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

test("scroll only renders newly visible cards and still applies item updates", async () => {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
	Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
		configurable: true,
		get() {
			return this.tagName === "MAIN" ? 600 : 200;
		},
	});
	const scroll = document.createElement("main");
	Object.defineProperty(scroll, "offsetWidth", { value: 800 });
	scroll.scrollTo = () => {};
	document.body.append(scroll);
	const scrollRef = { current: scroll };
	const items = Array.from({ length: 1000 }, (_, id) => ({
		id,
		title: `Book ${id}`,
	}));
	const renders = new Map<number, number>();
	const renderItem = (item: (typeof items)[number]) => {
		renders.set(item.id, (renders.get(item.id) ?? 0) + 1);
		return <a href={`#${item.id}`}>{item.title}</a>;
	};
	const grid = (data: typeof items) => (
		<ScrollContainerProvider value={scrollRef}>
			<VirtualizedCardGrid
				items={data}
				getKey={(item) => item.id}
				renderItem={renderItem}
				columns={4}
				gap={0}
				estimateRowHeight={200}
			/>
		</ScrollContainerProvider>
	);
	const view = render(grid(items), { container: scroll });
	await waitFor(() =>
		expect(view.getAllByRole("link").length).toBeGreaterThan(0),
	);
	expect(view.getAllByRole("link").length).toBeLessThan(40);
	const before = renders.get(8);
	act(() => {
		scroll.scrollTop = 200;
		fireEvent.scroll(scroll);
	});
	await waitFor(() => expect(view.getByText("Book 20")).toBeTruthy());
	expect(renders.get(8)).toBe(before);
	view.rerender(
		grid(
			items.map((item) =>
				item.id === 8 ? { ...item, title: "Updated title" } : item,
			),
		),
	);
	expect(view.getByText("Updated title")).toBeTruthy();
	act(() => {
		scroll.scrollTop = 200 * 200;
		fireEvent.scroll(scroll);
	});
	await waitFor(() => expect(view.getByText("Book 800")).toBeTruthy());
	expect(view.getAllByRole("link").length).toBeLessThan(40);
});
