import "@nanahoshi/test-utils/setup-dom";
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { BackDismiss, dismissTopOverlay } from "./back-dismiss";

afterEach(cleanup);

function Panels() {
	const [toc, setToc] = useState(true);
	const [search, setSearch] = useState(true);
	return (
		<>
			{toc && <BackDismiss onDismiss={() => setToc(false)} />}
			{search && <BackDismiss onDismiss={() => setSearch(false)} />}
			<p>{[toc && "toc", search && "search"].filter(Boolean).join(",")}</p>
		</>
	);
}

test("Back closes the newest panel first, then leaves once none is open", () => {
	const view = render(<Panels />);
	const back = () => {
		let handled = false;
		act(() => {
			handled = dismissTopOverlay();
		});
		return handled;
	};
	expect(back()).toBe(true);
	expect(view.container.textContent).toBe("toc");
	expect(back()).toBe(true);
	expect(view.container.textContent).toBe("");
	expect(back()).toBe(false);
});

test("an open popup is closed with Escape before any panel", () => {
	let escapes = 0;
	const listener = (event: KeyboardEvent) => {
		if (event.key === "Escape") escapes++;
	};
	document.addEventListener("keydown", listener);
	const view = render(
		<>
			<Panels />
			<div role="dialog" />
		</>,
	);
	expect(dismissTopOverlay()).toBe(true);
	expect(escapes).toBe(1);
	expect(view.container.textContent).toBe("toc,search");
	document.removeEventListener("keydown", listener);
});
