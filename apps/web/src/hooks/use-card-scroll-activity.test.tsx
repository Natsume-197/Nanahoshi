import "@/test-utils/setup-dom";
import { expect, test } from "bun:test";
import { fireEvent, renderHook } from "@testing-library/react";
import { useCardScrollActivity } from "./use-card-scroll-activity";

test("captures nested rails, restores hover after scrolling, and cleans up", async () => {
	const root = document.createElement("main");
	const rail = document.createElement("section");
	root.append(rail);
	const hook = renderHook(() => useCardScrollActivity({ current: root }));
	try {
		fireEvent.scroll(rail);
		expect(root.hasAttribute("data-card-scrolling")).toBe(true);
		await new Promise((resolve) => setTimeout(resolve, 180));
		expect(root.hasAttribute("data-card-scrolling")).toBe(false);
		fireEvent.scroll(root);
		expect(root.hasAttribute("data-card-scrolling")).toBe(true);
		hook.unmount();
		expect(root.hasAttribute("data-card-scrolling")).toBe(false);
		fireEvent.scroll(rail);
		expect(root.hasAttribute("data-card-scrolling")).toBe(false);
	} finally {
		hook.unmount();
	}
});
