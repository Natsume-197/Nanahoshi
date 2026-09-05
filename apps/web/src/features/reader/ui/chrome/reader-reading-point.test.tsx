import "@/test-utils/setup-dom";
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import {
	defaultReaderSettings,
	getReaderTheme,
} from "@/features/reader/presentation/settings";
import { ReaderReadingPoint } from "./reader-reading-point";

Object.assign(globalThis, {
	MutationObserver: window.MutationObserver,
	ResizeObserver: class {
		observe() {}
		disconnect() {}
		unobserve() {}
	},
	innerWidth: 1024,
	innerHeight: 768,
});

afterEach(() => {
	cleanup();
	document.body.replaceChildren();
});

test("marker follows its character without sticking to the viewport edge", async () => {
	const main = document.createElement("main");
	main.innerHTML =
		'<div data-reader-renderer="text-scroll" data-reader-character-start="0">abcdef</div>';
	document.body.append(main);
	let top = 30;
	const rect = () => ({
		top,
		bottom: top + 20,
		left: 100,
		right: 110,
		width: 10,
		height: 20,
		x: 100,
		y: top,
		toJSON() {},
	});
	const original = Object.getPrototypeOf(
		document.createRange(),
	).getBoundingClientRect;
	Object.getPrototypeOf(document.createRange()).getBoundingClientRect = rect;
	main.getBoundingClientRect = () => ({
		...rect(),
		top: 0,
		bottom: 600,
		height: 600,
	});
	try {
		const view = render(
			<ReaderReadingPoint
				position={{ exploredCharCount: 1, progress: 0.1, modifiedAt: 1 }}
				sections={[]}
				total={6}
				renderer="text-scroll"
				theme={getReaderTheme(defaultReaderSettings.theme, {})}
				onSave={() => {}}
				onGo={() => {}}
			/>,
		);
		const marker = document.querySelector('[role="img"]') as HTMLElement;
		expect(marker.style.top).toBe("30px");
		top = -5;
		await act(async () => {
			document.dispatchEvent(new window.Event("scroll"));
			await new Promise((resolve) => setTimeout(resolve, 40));
		});
		expect(marker.style.top).toBe("-5px");
		top = 30;
		await act(async () => {
			document.dispatchEvent(new window.Event("scroll"));
			await new Promise((resolve) => setTimeout(resolve, 40));
		});
		expect(marker.hidden).toBe(false);
		expect(marker.style.top).toBe("30px");
		await act(async () => {
			main.replaceChildren();
			await new Promise((resolve) => setTimeout(resolve, 40));
		});
		expect(marker.hidden).toBe(true);
		await act(async () => {
			main.innerHTML =
				'<nav><div data-reader-point-actions></div></nav><div data-reader-renderer="text-scroll" data-reader-character-start="0">abcdef</div>';
			await new Promise((resolve) => setTimeout(resolve, 40));
		});
		expect(marker.hidden).toBe(false);
		expect(marker.style.top).toBe("30px");
		expect(
			main.querySelector(
				'[data-reader-point-actions] button[aria-keyshortcuts="b"]',
			),
		).not.toBeNull();
		expect(
			main.querySelector(
				'[data-reader-point-actions] button[aria-keyshortcuts="r"]',
			),
		).not.toBeNull();
		view.unmount();
	} finally {
		Object.getPrototypeOf(document.createRange()).getBoundingClientRect =
			original;
	}
});
