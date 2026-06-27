/**
 * Per-file DOM setup for `bun:test`. Import this for its side effects at the top
 * of any test that needs DOM globals (`document`, `window`, `Node`,
 * `HTMLImageElement`, `localStorage`). Scoped per-file on purpose — registering
 * jsdom as a global test preload would also touch the `packages/api` tests that
 * run in the same `bun test` invocation.
 *
 * jsdom does no layout, so `getBoundingClientRect()`/`clientHeight` return 0 and
 * `innerHeight`/`innerWidth` fall back to jsdom defaults — fine for the pure
 * logic these tests cover, but layout-dependent calculators are NOT testable
 * here (see the browser harness).
 */
import { JSDOM } from "jsdom";

const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
	url: "http://localhost/",
});

const g = globalThis as unknown as Record<string, unknown>;
g.window = dom.window;
g.document = dom.window.document;
g.Node = dom.window.Node;
g.HTMLElement = dom.window.HTMLElement;
g.HTMLImageElement = dom.window.HTMLImageElement;
g.localStorage = dom.window.localStorage;
