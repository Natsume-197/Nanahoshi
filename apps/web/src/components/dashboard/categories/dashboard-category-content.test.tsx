import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";

let libraries: { mediaType: string }[] | undefined = [];
mock.module("@tanstack/react-query", () => ({
	useQuery: () => ({ data: libraries }),
}));
mock.module("@/utils/orpc", () => ({
	orpc: { libraries: { getLibraries: { queryOptions: () => ({}) } } },
}));
mock.module("@/components/dashboard/home/dashboard-home-content", () => ({
	DashboardHomeContent: () => <div>home content</div>,
}));
mock.module("./media-category-content", () => ({
	MediaCategoryContent: ({ category }: { category: string }) => (
		<div>{category} content</div>
	),
}));
const { DashboardCategoryContent } = await import(
	"./dashboard-category-content"
);
afterEach(cleanup);

test("hides category selectors without libraries, including initial loading", () => {
	for (const value of [undefined, []]) {
		libraries = value;
		const view = render(<DashboardCategoryContent />);
		expect(view.queryAllByRole("button")).toHaveLength(0);
		expect(view.getByText("home content")).toBeTruthy();
		cleanup();
	}
});

test("only shows library media types and falls back to home when a category disappears", () => {
	libraries = [{ mediaType: "ebook" }];
	const view = render(<DashboardCategoryContent />);
	expect(view.queryAllByRole("button")).toHaveLength(2);
	fireEvent.click(view.getByRole("button", { name: "Books", exact: true }));
	expect(view.getByText("books content")).toBeTruthy();
	libraries = [];
	view.rerender(<DashboardCategoryContent />);
	expect(view.getByText("home content")).toBeTruthy();
	expect(view.queryAllByRole("button")).toHaveLength(0);
});
