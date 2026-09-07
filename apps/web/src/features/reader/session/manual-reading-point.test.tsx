import "@/test-utils/setup-dom";
import { afterEach, expect, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { loadManualReadingPoint } from "./manual-reading-point";
import { loadLocalReadingPosition, useReaderSession } from "./reader-session";
import {
	rangeForReadingPoint,
	readingPointForSelection,
} from "./reading-point-dom";

const at = (exploredCharCount: number) => ({
	exploredCharCount,
	progress: exploredCharCount / 100,
	modifiedAt: Date.now(),
	locator: { sectionReference: "chapter", characterOffset: exploredCharCount },
});
afterEach(() => {
	cleanup();
	window.localStorage.clear();
});

test("manual navigation and capture keep the resume point while mode switches keep the live position", () => {
	const hook = renderHook(() => useReaderSession("manual-book"));
	act(() =>
		hook.result.current.hydrate({
			characters: 100,
			position: at(10),
			positionClockAt: 0,
		}),
	);
	act(() => {
		expect(hook.result.current.setManualSaving(true, at(10))).toBe(true);
	});
	act(() => {
		hook.result.current.reportPosition(at(60));
		hook.result.current.capturePosition(() => at(70));
	});
	expect(
		hook.result.current.readerSessionRef.current?.snapshot().position
			?.exploredCharCount,
	).toBe(70);
	expect(hook.result.current.getResumePosition(at(70))?.exploredCharCount).toBe(
		10,
	);
	expect(loadLocalReadingPosition("manual-book")?.exploredCharCount).toBe(10);
	hook.unmount();
	const reopened = renderHook(() => useReaderSession("manual-book"));
	act(() =>
		reopened.result.current.hydrate({
			characters: 100,
			position: { ...at(80), modifiedAt: 0 },
			positionClockAt: 0,
		}),
	);
	expect(reopened.result.current.exploredCharCount).toBe(10);
	act(() => {
		expect(reopened.result.current.saveManualPosition(at(25))).toBe(true);
	});
	expect(
		loadManualReadingPoint("manual-book").position?.exploredCharCount,
	).toBe(25);
	act(() => {
		expect(reopened.result.current.setManualSaving(false, at(70))).toBe(true);
		reopened.result.current.capturePosition(() => at(90));
	});
	expect(loadLocalReadingPosition("manual-book")?.exploredCharCount).toBe(90);
});

test("selection counts base text, and the same coordinate resolves in focus", () => {
	const root = document.createElement("div");
	root.innerHTML =
		'<div id="chapter"><p>前<ruby>漢<rt>かん</rt></ruby>字です。</p></div>';
	document.body.append(root);
	const text = root.querySelector("p")?.lastChild as Text;
	const selection = document.createRange();
	selection.setStart(text, 1);
	selection.setEnd(text, 3);
	const sections = [
		{
			reference: "chapter",
			startCharacter: 10,
			characters: 20,
			charactersWeight: 20,
		},
	];
	try {
		const position = readingPointForSelection(selection, root, sections, 100);
		expect(position?.exploredCharCount).toBe(13);
		if (!position) throw new Error("missing selected position");
		root.innerHTML =
			'<div id="chapter" data-reader-character-start="12">字です。</div>';
		const marker = rangeForReadingPoint(root, position, sections);
		expect(marker?.toString()).toBe("で");
		const focusSelection = document.createRange();
		const focusText = root.firstChild?.firstChild as Text;
		focusSelection.setStart(focusText, 1);
		focusSelection.setEnd(focusText, 3);
		expect(
			readingPointForSelection(focusSelection, root, sections, 100)
				?.exploredCharCount,
		).toBe(13);
	} finally {
		root.remove();
	}
});

test("reopening adopts a newer bookmark from another device", () => {
	const first = renderHook(() => useReaderSession("shared-book"));
	act(() => {
		first.result.current.saveManualPosition(at(10));
	});
	const old = loadManualReadingPoint("shared-book").position;
	if (!old) throw new Error("missing local bookmark");
	first.unmount();
	const remote = { ...at(60), modifiedAt: old.modifiedAt + 1000 };
	const second = renderHook(() => useReaderSession("shared-book"));
	act(() =>
		second.result.current.hydrate({
			characters: 100,
			position: remote,
			positionClockAt: remote.modifiedAt,
		}),
	);
	expect(second.result.current.exploredCharCount).toBe(60);
	expect(
		second.result.current.getResumePosition(at(80))?.exploredCharCount,
	).toBe(60);
});

test("an open reader accepts newer remote positions but preserves newer local intent", () => {
	const hook = renderHook(() => useReaderSession("open-book"));
	act(() =>
		hook.result.current.hydrate({
			characters: 100,
			position: { ...at(10), modifiedAt: 10 },
			positionClockAt: 10,
		}),
	);
	act(() => {
		expect(
			hook.result.current.applyRemotePosition({ ...at(60), modifiedAt: 60 }),
		).toBe(true);
	});
	expect(hook.result.current.exploredCharCount).toBe(60);
	act(() => {
		hook.result.current.reportPosition({ ...at(70), modifiedAt: 100 });
	});
	act(() => {
		expect(
			hook.result.current.applyRemotePosition({ ...at(20), modifiedAt: 80 }),
		).toBe(false);
	});
	expect(hook.result.current.exploredCharCount).toBe(70);
});

test("switching back to automatic saving sends a new intent even without movement", () => {
	const hook = renderHook(() => useReaderSession("mode-book"));
	act(() =>
		hook.result.current.hydrate({
			characters: 100,
			position: { ...at(10), modifiedAt: 10 },
			positionClockAt: 10,
		}),
	);
	act(() => {
		hook.result.current.setManualSaving(true, at(10));
	});
	const manualClock = hook.result.current.manualPoint.position?.modifiedAt ?? 0;
	act(() => {
		hook.result.current.setManualSaving(false, at(10));
	});
	const resume = hook.result.current.getResumePosition(
		hook.result.current.readerSessionRef.current?.snapshot().position,
	);
	expect(resume?.modifiedAt).toBeGreaterThan(manualClock);
});
