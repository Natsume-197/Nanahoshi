import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { useMountEffect } from "@/hooks/use-mount-effect";

export interface ReaderSettings {
	fontSize: number;
	lineHeight: number;
	fontFamily: string | null;
	verticalPadding: number;
	horizontalPadding: number;
	vertical: boolean;
	paginated: boolean;
	showFurigana: boolean;
	disableCss: boolean;
}

export const builtInFonts = [
	{ label: "Default (System Font)", value: "__default__" },
	{ label: "Noto Sans JP", value: "Noto Sans JP" },
	{ label: "Noto Serif JP", value: "Noto Serif JP" },
	{ label: "Klee One", value: "Klee One" },
	{ label: "Shippori Mincho", value: "Shippori Mincho" },
];

// Map font values to Google Fonts family parameter (some need specific weights)
const GOOGLE_FONT_PARAMS: Record<string, string> = {
	"Noto Sans JP": "Noto+Sans+JP:wght@400;700",
	"Noto Serif JP": "Noto+Serif+JP:wght@400;700",
	"Klee One": "Klee+One",
	"Shippori Mincho": "Shippori+Mincho:wght@400;700",
};

const LS_PREFIX = "reader:";

function getNumber(key: string, fallback: number): number {
	if (typeof window === "undefined") return fallback;
	return Number(localStorage.getItem(LS_PREFIX + key) || fallback);
}

function getBool(key: string, defaultVal: boolean): boolean {
	if (typeof window === "undefined") return defaultVal;
	const item = localStorage.getItem(LS_PREFIX + key);
	return item !== null ? item === "true" : defaultVal;
}

function getString(key: string, fallback: string | null): string | null {
	if (typeof window === "undefined") return fallback;
	const item = localStorage.getItem(LS_PREFIX + key);
	return item === null ? fallback : item;
}

function persist(key: string, value: unknown) {
	localStorage.setItem(LS_PREFIX + key, String(value));
}

function loadSettings(): ReaderSettings {
	return {
		fontSize: Math.max(getNumber("fontSize", 16), 1),
		lineHeight: Math.max(getNumber("lineHeight", 1.5), 1),
		fontFamily: getString("fontFamily", null),
		verticalPadding: Math.max(getNumber("verticalPadding", 2), 0),
		horizontalPadding: Math.max(getNumber("horizontalPadding", 2), 0),
		vertical: getBool("vertical", false),
		paginated: getBool("paginated", true),
		showFurigana: getBool("showFurigana", true),
		disableCss: getBool("injectCss", false),
	};
}

type SetSettingFn = <K extends keyof ReaderSettings>(
	key: K,
	value: ReaderSettings[K],
) => void;

const ReaderSettingsContext = createContext<
	readonly [ReaderSettings, SetSettingFn] | null
>(null);

export function ReaderSettingsProvider({ children }: { children: ReactNode }) {
	const [settings, setSettingsState] = useState<ReaderSettings>(loadSettings);

	const setSetting = useCallback<SetSettingFn>((key, value) => {
		const persistKey =
			key === "disableCss"
				? "injectCss"
				: key === "fontFamily"
					? "fontFamily"
					: key;
		const persistValue =
			key === "fontFamily" && value === "__default__" ? "" : value;
		persist(persistKey, persistValue);

		setSettingsState((prev) => ({ ...prev, [key]: value }));
	}, []);

	useMountEffect(() => {
		reflectFont(settings.fontFamily);
		return () => {
			document.body.style.removeProperty("--app-font");
			document.getElementById(GOOGLE_FONT_LINK_ID)?.remove();
		};
	});

	// Reflect font changes inline during render via ref check
	const prevFontRef = useRef(settings.fontFamily);
	if (settings.fontFamily !== prevFontRef.current) {
		prevFontRef.current = settings.fontFamily;
		reflectFont(settings.fontFamily);
	}

	const value = useMemo(
		() => [settings, setSetting] as const,
		[settings, setSetting],
	);

	return (
		<ReaderSettingsContext.Provider value={value}>
			{children}
		</ReaderSettingsContext.Provider>
	);
}

export function useReaderSettings() {
	const ctx = useContext(ReaderSettingsContext);
	if (!ctx)
		throw new Error(
			"useReaderSettings must be used inside <ReaderSettingsProvider>",
		);
	return ctx;
}

const GOOGLE_FONT_LINK_ID = "reader-google-font";

function reflectFont(fontFamily: string | null) {
	if (typeof document === "undefined") return;

	// Remove previous Google Font link
	document.getElementById(GOOGLE_FONT_LINK_ID)?.remove();

	if (fontFamily && fontFamily !== "__default__") {
		document.body.style.setProperty("--app-font", `"${fontFamily}"`);

		// Load from Google Fonts using the explicit parameter map
		const fontParam = GOOGLE_FONT_PARAMS[fontFamily];
		if (fontParam) {
			const link = document.createElement("link");
			link.id = GOOGLE_FONT_LINK_ID;
			link.rel = "stylesheet";
			link.href = `https://fonts.googleapis.com/css2?family=${fontParam}&display=swap`;
			document.head.appendChild(link);
		}
	} else {
		document.body.style.removeProperty("--app-font");
	}
}
