import { afterEach, beforeAll, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { JSDOM } from "jsdom";
import { PlayerModeSelector } from "./player-mode-selector";

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

describe("PlayerModeSelector", () => {
	test("shows Listen and Read & Listen as exclusive player modes", () => {
		const onModeChange = mock(() => {});
		const view = render(
			<PlayerModeSelector mode="read-listen" onModeChange={onModeChange} />,
		);

		const listen = view.getByRole("radio", { name: "Listen" });
		const readListen = view.getByRole("radio", {
			name: "Read & Listen",
		});
		expect((listen as HTMLInputElement).checked).toBe(false);
		expect((readListen as HTMLInputElement).checked).toBe(true);
		expect(readListen.nextElementSibling?.className).toContain(
			"bg-white text-black",
		);

		fireEvent.click(listen);
		expect(onModeChange).toHaveBeenCalledWith("listen");
	});

	test("keeps labels crisp without a backdrop filter", () => {
		const view = render(
			<PlayerModeSelector mode="listen" onModeChange={() => {}} />,
		);

		expect(view.container.firstElementChild?.className).not.toContain(
			"backdrop-blur",
		);
	});

	test("moves between modes with the arrow keys", () => {
		const view = render(
			<PlayerModeSelector mode="listen" onModeChange={() => {}} />,
		);
		const listen = view.getByRole("radio", { name: "Listen" });
		const readListen = view.getByRole("radio", { name: "Read & Listen" });

		listen.focus();
		fireEvent.keyDown(listen, { key: "ArrowRight" });

		expect(document.activeElement === readListen).toBe(true);
	});
});
