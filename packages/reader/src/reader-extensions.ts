import type { ReactNode, RefObject } from "react";
import type { LazyHtmlBook } from "./document/lazy-html-book";
import type { ReaderSourceFormat, Section } from "./document/types";
import type { ReaderTheme } from "./presentation/settings";
import type { BookReaderApi } from "./reader-contract";

/** Live handles into the mounted reader, for integrations that drive it. */
export interface ReaderRuntime {
	apiRef: RefObject<BookReaderApi | null>;
	surfaceRef: RefObject<HTMLElement | null>;
	/** Last explored character; integrations may move it before a restore. */
	exploredRef: RefObject<number>;
	bookCharCountRef: RefObject<number>;
}

export interface ReadListenRenderContext {
	runtime: ReaderRuntime;
	sections: Section[];
	sourceFormat: ReaderSourceFormat | undefined;
	lazyBook: LazyHtmlBook | undefined;
	/** Changes whenever the reader DOM is replaced. */
	domRevision: string;
	pauseAudioAfterLine: boolean;
	theme: ReaderTheme;
}

/** Read & Listen is supplied by the host app; the reader only offers the hooks. */
export interface ReadListenExtension {
	active: boolean;
	available: boolean;
	toggle(runtime: ReaderRuntime): void;
	/** Rendered inside the reader surface once the book is ready. */
	render(context: ReadListenRenderContext): ReactNode;
}
