import { expect, test } from "bun:test";
import { isCoveredByCard } from "./depth-screen-model";

const r = (key: string, name: string) => ({ key, name });

test("a list sinks when a title's page is pushed over it", () => {
	const routes = [r("a", "index"), r("b", "book/[uuid]")];
	expect(isCoveredByCard(routes, "a")).toBe(true);
	expect(
		isCoveredByCard([r("a", "index"), r("b", "audiobook/[uuid]")], "a"),
	).toBe(true);
});

test("ordinary pages slide in sideways without sinking what's below", () => {
	expect(
		isCoveredByCard([r("a", "index"), r("b", "settings/index")], "a"),
	).toBe(false);
});

test("a page being popped back to a title never sinks", () => {
	// Author page popped: the stack is back to [home, book], the author is gone.
	expect(isCoveredByCard([r("a", "index"), r("b", "book/[uuid]")], "c")).toBe(
		false,
	);
	// The title on top itself never sinks under its own card.
	expect(isCoveredByCard([r("a", "index"), r("b", "book/[uuid]")], "b")).toBe(
		false,
	);
});
