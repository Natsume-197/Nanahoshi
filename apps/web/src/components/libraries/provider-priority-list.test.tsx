import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";

const { cleanup, render } = await import("@testing-library/react");
const sortable = await import("@dnd-kit/sortable");
mock.module("@dnd-kit/sortable", () => ({
	...sortable,
	useSortable: () => ({
		attributes: {},
		listeners: {},
		setActivatorNodeRef: () => {},
		setNodeRef: () => {},
		isDragging: true,
		transform: { x: 0, y: 72, scaleX: 1, scaleY: 0.5 },
		transition: undefined,
	}),
}));
const { ProviderPriorityList } = await import("./provider-priority-list");
afterEach(cleanup);
test("dragging over a shorter row moves the card without shrinking it", () => {
	const view = render(
		<ProviderPriorityList
			value={[
				{ id: "amazon", enabled: true },
				{ id: "goodreads", enabled: true },
			]}
			onChange={() => {}}
		/>,
	);
	const row = view.getAllByRole("listitem")[0];
	expect(row.style.transform).toContain("translate3d(0px, 72px, 0)");
	expect(row.style.transform).not.toContain("scale");
});
