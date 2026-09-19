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
afterEach(() => {
	cleanup();
	localStorage.clear();
});

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
	expect(localStorage.getItem("nanahoshi-dashboard-category")).toBe("books");
	libraries = [];
	view.rerender(<DashboardCategoryContent />);
	expect(view.getByText("home content")).toBeTruthy();
	expect(view.queryAllByRole("button")).toHaveLength(0);
});

test("restores the selected category after mounting again", () => {
	libraries = [{ mediaType: "ebook" }, { mediaType: "audiobook" }];
	localStorage.setItem("nanahoshi-dashboard-category", "audiobooks");

	const view = render(<DashboardCategoryContent />);

	expect(view.getByText("audiobooks content")).toBeTruthy();
});
