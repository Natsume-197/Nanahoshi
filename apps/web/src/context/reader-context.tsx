import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import type { EpubBook } from "@/lib/epub";
import type { Bookmark } from "@/lib/epub/types";

type SideBar = "toc" | "bookmarks" | "settings" | null;

interface ReaderState {
	book: EpubBook;
	currSection: number;
	settingsVersion: number;
}

interface ReaderUI {
	navOpen: boolean;
	sideBar: SideBar;
}

interface ReaderStats {
	currChars: number;
	currIndex: number;
}

interface ReaderDispatch {
	updateChars: (isPaginated: boolean, isVertical: boolean) => number;
	navigationGoTo: (file: string) => void;
	bookmarkGoTo: (bookmark: Bookmark) => void;
	openNavbar: () => void;
	closeNavbar: () => void;
	setSidebar: (value: SideBar) => void;
	setSection: (section: number) => void;
	applySettings: () => void;
}

const ReaderStateContext = createContext<ReaderState | null>(null);
const ReaderUIContext = createContext<ReaderUI | null>(null);
const ReaderStatsContext = createContext<ReaderStats | null>(null);
const ReaderDispatchContext = createContext<ReaderDispatch | null>(null);

export function ReaderProvider({
	book,
	children,
}: {
	book: EpubBook;
	children: ReactNode;
}) {
	const [navOpen, setNavOpen] = useState(false);
	const [sideBar, setSideBarState] = useState<SideBar>(null);
	const [currSection, setCurrSection] = useState(
		() => book.findSectionIndex(book.currParagraph) ?? 0,
	);

	// Character stats in a separate context — only CharacterCounter subscribes,
	// so changes here don't re-render ReaderContent or other heavy components.
	const [stats, setStats] = useState<ReaderStats>({
		currChars: book.currChars,
		currIndex: 0,
	});

	const bookRef = useRef(book);
	bookRef.current = book;

	// Debounce book.save() to avoid writing the full record to IndexedDB on every page flip
	const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const updateChars = useCallback(
		(isPaginated: boolean, isVertical: boolean): number => {
			let lastIndex = 0;
			let chars = 0;
			const pTags = document.querySelectorAll(
				"p[index], img[index], image[index]",
			);
			for (let i = 0; i < pTags.length; i++) {
				const rect = pTags[i].getBoundingClientRect();

				lastIndex = Number(pTags[i].getAttribute("index")) ?? lastIndex;
				chars = Number(pTags[i].getAttribute("characumm")) ?? chars;

				if (
					(!isPaginated && !isVertical && rect.bottom > 0) ||
					(!isPaginated && isVertical && rect.x < window.innerWidth) ||
					(isPaginated && !isVertical && rect.x > 0) ||
					(isPaginated && isVertical && rect.y > 0)
				)
					break;
			}

			bookRef.current.currParagraph = lastIndex;
			bookRef.current.currChars = chars;

			// Debounced save — coalesce rapid page flips into a single write
			if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
			saveTimerRef.current = setTimeout(() => {
				bookRef.current.save().catch(console.error);
			}, 1000);

			setStats((prev) => {
				if (prev.currChars === chars && prev.currIndex === lastIndex)
					return prev;
				return { currChars: chars, currIndex: lastIndex };
			});
			return lastIndex;
		},
		[],
	);

	const navigationGoTo = useCallback((name: string) => {
		setCurrSection((prev) => {
			const section = bookRef.current.sections[prev];
			if (section.name !== name) {
				const sectionId = bookRef.current.sections.findIndex(
					(s) => s.name === name,
				);
				if (sectionId !== -1) return sectionId;
			}
			return prev;
		});

		requestAnimationFrame(() => {
			document.getElementById(name)?.scrollIntoView();
		});
	}, []);

	const bookmarkGoTo = useCallback((bookmark: Bookmark) => {
		const sectionId = bookRef.current.findSectionIndexById(
			bookmark.sectionName,
		);
		if (sectionId != null) {
			setCurrSection(sectionId);
		}

		requestAnimationFrame(() => {
			document
				.querySelector(`p[index="${bookmark.paragraphId}"]`)
				?.scrollIntoView({ inline: "center" });
		});
	}, []);

	const openNavbar = useCallback(() => {
		setNavOpen(true);
		setSideBarState(null);
	}, []);

	const closeNavbar = useCallback(() => {
		setNavOpen(false);
		setSideBarState(null);
	}, []);

	const setSidebar = useCallback((value: SideBar) => {
		setSideBarState(value);
	}, []);

	const setSection = useCallback((section: number) => {
		setCurrSection(section);
	}, []);

	const [settingsVersion, setSettingsVersion] = useState(0);

	const applySettings = useCallback(() => {
		// Save current position before remount
		bookRef.current.save().catch(console.error);
		setSideBarState(null);
		setSettingsVersion((v) => v + 1);
	}, []);

	const state = useMemo<ReaderState>(
		() => ({
			book,
			currSection,
			settingsVersion,
		}),
		[book, currSection, settingsVersion],
	);

	const ui = useMemo<ReaderUI>(
		() => ({
			navOpen,
			sideBar,
		}),
		[navOpen, sideBar],
	);

	const dispatch = useMemo<ReaderDispatch>(
		() => ({
			updateChars,
			navigationGoTo,
			bookmarkGoTo,
			openNavbar,
			closeNavbar,
			setSidebar,
			setSection,
			applySettings,
		}),
		[
			updateChars,
			navigationGoTo,
			bookmarkGoTo,
			openNavbar,
			closeNavbar,
			setSidebar,
			setSection,
			applySettings,
		],
	);

	return (
		<ReaderStateContext.Provider value={state}>
			<ReaderUIContext.Provider value={ui}>
				<ReaderStatsContext.Provider value={stats}>
					<ReaderDispatchContext.Provider value={dispatch}>
						{children}
					</ReaderDispatchContext.Provider>
				</ReaderStatsContext.Provider>
			</ReaderUIContext.Provider>
		</ReaderStateContext.Provider>
	);
}

export function useReaderState(): ReaderState {
	const ctx = useContext(ReaderStateContext);
	if (!ctx)
		throw new Error("useReaderState must be used inside <ReaderProvider>");
	return ctx;
}

export function useReaderUI(): ReaderUI {
	const ctx = useContext(ReaderUIContext);
	if (!ctx) throw new Error("useReaderUI must be used inside <ReaderProvider>");
	return ctx;
}

export function useReaderStats(): ReaderStats {
	const ctx = useContext(ReaderStatsContext);
	if (!ctx)
		throw new Error("useReaderStats must be used inside <ReaderProvider>");
	return ctx;
}

export function useReaderDispatch(): ReaderDispatch {
	const ctx = useContext(ReaderDispatchContext);
	if (!ctx)
		throw new Error("useReaderDispatch must be used inside <ReaderProvider>");
	return ctx;
}
