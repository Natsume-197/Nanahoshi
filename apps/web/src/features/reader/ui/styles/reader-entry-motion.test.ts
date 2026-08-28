import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";

const css = readFileSync(
	new URL("../../../../index.css", import.meta.url),
	"utf8",
);
const readerRoute = readFileSync(
	new URL("../../../../routes/reader/$uuid.tsx", import.meta.url),
	"utf8",
);
const readerScreen = readFileSync(
	new URL("../../reader-screen.tsx", import.meta.url),
	"utf8",
);
const loadingScreen = readFileSync(
	new URL("../chrome/reader-loading-screen.tsx", import.meta.url),
	"utf8",
);
const readerQuickSettings = readFileSync(
	new URL("../settings/reader-quick-settings.tsx", import.meta.url),
	"utf8",
);
const readerEntryCss = css.slice(
	css.indexOf("/* The reader replaces the routed surface"),
	css.indexOf("/* A near-black version of the extracted main colour"),
);

describe("reader entry motion", () => {
	it("shows the reader shell without the router's default pending delay", () => {
		expect(readerRoute).toContain("pendingComponent: ReaderRoutePending");
		expect(readerRoute).toContain("pendingMs: 0");
		expect(readerRoute).toContain("pendingMinMs: 0");
		expect(readerScreen).toContain("<ReaderLoadingScreen");
	});

	it("fades the routed surface without containing its fixed reader chrome", () => {
		expect(readerScreen).toContain('className="reader-route-content ');
		expect(readerScreen).toContain("font-reader-sans");
		expect(readerEntryCss).toContain(".reader-route-content");
		expect(readerEntryCss).toContain("transition-property: opacity;");
		expect(readerEntryCss).not.toContain("transform: translate3d(0, 0, 0)");
		expect(readerEntryCss).not.toContain(
			"transform: translate3d(var(--page-slide-distance), 0, 0)",
		);
		expect(readerQuickSettings).toContain("reader-quick-settings-dialog");
		expect(readerQuickSettings).toContain('willChange: "transform"');
		expect(readerQuickSettings).not.toContain("backdropClassName");
		expect(css).not.toContain(".reader-route-content {\n\tfilter:");
	});

	it("keeps the spinner, loading semantics, and a reduced-motion path", () => {
		expect(loadingScreen).toContain("size-12 animate-spin");
		expect(loadingScreen).toContain('role="status"');
		expect(loadingScreen).toContain('aria-live="polite"');
		expect(loadingScreen).toContain('aria-hidden="true"');
		expect(css).toContain("@media (prefers-reduced-motion: reduce)");
		expect(loadingScreen).toContain("motion-reduce:animate-none");
	});

	it("uses symmetric route snapshots without moving the live reader chrome", () => {
		expect(css).toContain(
			'html[data-read-listen-navigation="enter"]::view-transition-new(root)',
		);
		expect(css).toContain(
			'html[data-read-listen-navigation="exit"]::view-transition-old(root)',
		);
		expect(css).toContain("@keyframes read-listen-route-arrive");
		expect(css).toContain("@keyframes read-listen-route-leave");
		expect(readerEntryCss).not.toContain(
			".reader-route-content {\n\ttransform:",
		);
	});
});
