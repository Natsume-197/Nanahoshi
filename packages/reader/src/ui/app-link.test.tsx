import "@nanahoshi/test-utils/setup-dom";
import { afterEach, expect, mock, test } from "bun:test";
import { bindFakeReaderHost } from "../host/fake-reader-host";

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { AppLink } = await import("./app-link");

const openAppRoute = mock((_href: string) => {});
bindFakeReaderHost({}, { openAppRoute });
afterEach(() => {
	cleanup();
	openAppRoute.mockClear();
});

test("a plain click opens the page in the app", () => {
	const view = render(<AppLink href="/dashboard/stats">Stats</AppLink>);

	const allowed = fireEvent.click(view.getByText("Stats"));

	expect(openAppRoute).toHaveBeenCalledWith("/dashboard/stats");
	expect(allowed).toBe(false);
});

test("a modified click is left to the browser, e.g. a new tab", () => {
	const view = render(<AppLink href="/dashboard/stats">Stats</AppLink>);

	const allowed = fireEvent.click(view.getByText("Stats"), { ctrlKey: true });

	expect(openAppRoute).not.toHaveBeenCalled();
	expect(allowed).toBe(true);
});
