import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { cleanup, render, waitFor } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { renderToString } from "react-dom/server";
import { HydratedFieldset } from "./hydrated-fieldset";

beforeAll(() => {
	const dom = new JSDOM("<!doctype html><html><body></body></html>");
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		HTMLElement: dom.window.HTMLElement,
		Node: dom.window.Node,
		IS_REACT_ACT_ENVIRONMENT: true,
	});
});

afterEach(cleanup);

describe("HydratedFieldset", () => {
	test("disables controlled fields in server HTML", () => {
		const html = renderToString(
			<HydratedFieldset>
				<input name="email" />
			</HydratedFieldset>,
		);

		expect(html).toContain('<fieldset disabled=""');
	});

	test("enables fields after React attaches their handlers", async () => {
		const view = render(
			<HydratedFieldset>
				<input name="email" />
			</HydratedFieldset>,
		);
		const fieldset = view.container.querySelector("fieldset");

		await waitFor(() => expect(fieldset?.disabled).toBe(false));
	});
});
