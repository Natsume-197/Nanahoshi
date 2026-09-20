import "@/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";

const book = {
	type: "book" as const,
	uuid: "book-1",
	title: "Alpha",
	filename: "alpha.epub",
	cover: null,
	authors: [],
};
const navigate = mock(() => {});

mock.module("@tanstack/react-query", () => ({
	useQuery: () => ({ data: { hits: [book] }, isFetching: false }),
}));
mock.module("@tanstack/react-router", () => ({
	useNavigate: () => navigate,
	useLocation: () => ({ pathname: "/dashboard", search: {} }),
}));
mock.module("@/hooks/use-debounce", () => ({
	useDebounce: (value: string) => value,
}));
mock.module("@/utils/top-search", () => ({
	topSearchQueryOptions: () => ({}),
}));

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { DashboardHeaderSearch } = await import("./dashboard-header-search");

afterEach(() => {
	cleanup();
	localStorage.clear();
	navigate.mockClear();
});

test("opening a search result records the selected item", () => {
	localStorage.setItem(
		"nanahoshi:search-history",
		JSON.stringify([{ kind: "query", query: "Dune", visitedAt: 1 }]),
	);
	const view = render(<DashboardHeaderSearch />);
	const input = view.getByRole("combobox");

	fireEvent.change(input, { target: { value: "Alpha" } });
	fireEvent.click(view.getByRole("option", { name: /Alpha/ }));

	const stored = JSON.parse(
		localStorage.getItem("nanahoshi:search-history") ?? "[]",
	);
	expect(stored.map((entry: { kind: string }) => entry.kind)).toEqual([
		"hit",
		"query",
	]);

	fireEvent.focus(input);
	expect(view.getByRole("option", { name: /Alpha/ })).toBeTruthy();
	expect(view.getByRole("option", { name: "Dune" })).toBeTruthy();

	fireEvent.click(view.getByRole("button", { name: "Remove Alpha" }));
	expect(view.queryByRole("option", { name: /Alpha/ })).toBeNull();
	expect(view.getByRole("option", { name: "Dune" })).toBeTruthy();
});
